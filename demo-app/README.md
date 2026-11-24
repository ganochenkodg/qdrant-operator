# Demo RAG application

In this guide, we will set up a simple Qdrant cluster along with a demo application that uploads PDF documents to Qdrant and answers questions about their content completely locally on CPU — no GPU or paid cloud APIs required.

We use the following models via [`@huggingface/transformers`](https://huggingface.co/docs/transformers.js):

- `Xenova/multilingual-e5-small` (`q8`, 384 dimensions) for embedding document chunks.
- `HuggingFaceTB/SmolLM2-360M-Instruct` (`q4`) for generating concise answers from retrieved context.

Qdrant stores the vectorized chunks and performs semantic search for the relevant context.

1. Deploy a minimal Qdrant cluster:

```bash
kubectl apply -f https://raw.githubusercontent.com/ganochenkodg/qdrant-operator/main/examples/qdrant-cluster-minimal.yaml
```

2. Start the pod with the demo app (requires at least 1 CPU and 2–4 GiB of memory):

```bash
kubectl apply -f https://raw.githubusercontent.com/ganochenkodg/qdrant-operator/main/demo-app/demo-app.yaml
```

3. Wait for its readiness and connect:

```bash
kubectl wait pod/demo-app --for=condition=Ready --timeout=300s
kubectl exec -it demo-app -- sh
```

4. This pod contains two prepared PDF documents in the `pdfs` folder:

- `carbon-free-energy.pdf` — Google report about renewable sources of energy (2023)
- `cost-of-living.pdf` — cost of living report for EU countries (2022)

Run the demo app, passing a document as an argument:

```bash
node index.js pdfs/carbon-free-energy.pdf
```

After the models are initialized and the chunks are uploaded to Qdrant, you will see a greeting from the bot and can ask questions. Press `Ctrl-C` to exit.

![demo-rag](../resources/demo-rag.gif)

You can also try the second document:

```bash
node index.js pdfs/cost-of-living.pdf
```

Feel free to use this application as a starting point for your own RAG projects powered by Qdrant.

### Code explanation

Import the required modules:

```js
import { readFile } from 'node:fs/promises';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { PDFParse } from 'pdf-parse';
import { Document } from '@langchain/core/documents';
import { Embeddings } from '@langchain/core/embeddings';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { QdrantVectorStore } from '@langchain/qdrant';
import { pipeline } from '@huggingface/transformers';
```

Wrap the local Hugging Face feature-extraction pipeline in a LangChain `Embeddings` adapter (using `passage:` / `query:` prefixes as expected by E5 models):

```js
class LocalTransformersEmbeddings extends Embeddings {
  constructor(extractor) {
    super({});
    this.extractor = extractor;
  }

  async embedDocuments(texts) {
    const vectors = [];
    for (const text of texts) {
      const res = await this.extractor(`passage: ${text}`, {
        pooling: 'mean',
        normalize: true
      });
      vectors.push(Array.from(res.data));
    }
    return vectors;
  }

  async embedQuery(text) {
    const res = await this.extractor(`query: ${text}`, {
      pooling: 'mean',
      normalize: true
    });
    return Array.from(res.data);
  }
}
```

Initialize the quantized embedding and text-generation models:

```js
const extractor = await pipeline('feature-extraction', EMBEDDING_MODEL, {
  dtype: 'q8'
});
const embeddings = new LocalTransformersEmbeddings(extractor);
const generator = await pipeline('text-generation', LLM_MODEL, {
  dtype: 'q4'
});
```

Parse the PDF, split it into overlapping chunks, and upload them to Qdrant:

```js
const parser = new PDFParse({ data: await readFile(filename) });
const { text } = await parser.getText();
await parser.destroy();

const textSplitter = new RecursiveCharacterTextSplitter({
  chunkSize: 1200,
  chunkOverlap: 150
});
const splitDocs = await textSplitter.splitDocuments([
  new Document({ pageContent: text, metadata: { source: filename } })
]);

const vectorStore = await QdrantVectorStore.fromDocuments(
  splitDocs,
  embeddings,
  {
    url: process.env.QDRANT_URL,
    collectionName: COLLECTION_NAME
  }
);
```

In the interactive loop, retrieve the top 2 matching chunks from Qdrant and ask `SmolLM2-360M-Instruct` to answer using only that context:

```js
const docs = await vectorStore.similaritySearch(query, 2);
const context = docs.map((d) => d.pageContent).join('\n\n---\n\n');
const messages = [
  {
    role: 'system',
    content:
      'Answer the question using only the provided context. Keep your answer short (2-3 sentences if possible). If the context does not contain the answer, say you do not know.'
  },
  {
    role: 'user',
    content: `Context:\n${context}\n\nQuestion: ${query}`
  }
];

const result = await generator(messages, {
  max_new_tokens: 120,
  do_sample: false
});
```
