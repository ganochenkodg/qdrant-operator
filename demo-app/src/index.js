import { readFile } from 'node:fs/promises';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { PDFParse } from 'pdf-parse';
import { Document } from '@langchain/core/documents';
import { Embeddings } from '@langchain/core/embeddings';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { QdrantClient } from '@qdrant/js-client-rest';
import { QdrantVectorStore } from '@langchain/qdrant';
import { pipeline } from '@huggingface/transformers';

const EMBEDDING_MODEL = 'Xenova/multilingual-e5-small';
const LLM_MODEL = 'HuggingFaceTB/SmolLM2-360M-Instruct';
const COLLECTION_NAME = 'qa-docs';

const filename = process.argv[2];
if (!filename) {
  console.error('Usage: node index.js <path-to-pdf>');
  process.exit(1);
}

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

console.log('Initializing required models...');
const extractor = await pipeline('feature-extraction', EMBEDDING_MODEL, {
  dtype: 'q8'
});
const embeddings = new LocalTransformersEmbeddings(extractor);
const generator = await pipeline('text-generation', LLM_MODEL, {
  dtype: 'q4'
});

console.log(`Demo application started! Loading ${filename}...`);
const parser = new PDFParse({ data: await readFile(filename) });
const { text } = await parser.getText();
await parser.destroy();

console.log(`Splitting ${filename} into chunks...`);
const textSplitter = new RecursiveCharacterTextSplitter({
  chunkSize: 1200,
  chunkOverlap: 150
});
const splitDocs = await textSplitter.splitDocuments([
  new Document({ pageContent: text, metadata: { source: filename } })
]);

console.log(
  `Uploading ${splitDocs.length} chunks to Qdrant (${process.env.QDRANT_URL})...`
);
const qdrantClient = new QdrantClient({
  url: process.env.QDRANT_URL,
  checkCompatibility: false
});
const vectorStore = await QdrantVectorStore.fromDocuments(
  splitDocs,
  embeddings,
  {
    client: qdrantClient,
    collectionName: COLLECTION_NAME
  }
);

const rl = createInterface({ input, output });
rl.on('SIGINT', () => {
  rl.close();
  process.exit(0);
});
console.log('\x1b[36mBot:\x1b[0m Hello! How can I help you?');

try {
  while (true) {
    let query;
    try {
      query = (await rl.question('\x1b[33mUser:\x1b[0m ')).trim();
    } catch (err) {
      if (err.code === 'ERR_USE_AFTER_CLOSE' || err.name === 'AbortError') {
        break;
      }
      throw err;
    }
    if (!query) {
      continue;
    }

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
    const generated = result[0].generated_text;
    const answer = Array.isArray(generated)
      ? generated.at(-1).content.trim()
      : String(generated).trim();

    console.log(`\x1b[36mBot:\x1b[0m ${answer}`);
  }
} finally {
  rl.close();
}
