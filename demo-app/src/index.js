import readline from 'readline-sync';
import { PDFLoader } from 'langchain/document_loaders/fs/pdf';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import { HuggingFaceTransformersEmbeddings } from '@langchain/community/embeddings/hf_transformers';
import { QdrantVectorStore } from '@langchain/community/vectorstores/qdrant';
import { pipeline } from '@xenova/transformers';

const capitalizeFirstLetter = (string) => {
  return string.charAt(0).toUpperCase() + string.slice(1);
};

const filename = process.argv[2];
const loader = new PDFLoader(filename, {
  splitPages: false
});
const textSplitter = new RecursiveCharacterTextSplitter({
  chunkSize: 1500,
  chunkOverlap: 0
});

console.log('Initializing required models...');
const embeddings = new HuggingFaceTransformersEmbeddings({
  modelName: 'Xenova/all-MiniLM-L6-v2'
});
const answerer = await pipeline(
  'question-answering',
  'Xenova/distilbert-base-cased-distilled-squad'
);

console.log(`Demo application started! Loading ${filename}...`);
const docs = await loader.load();

console.log(`Splitting ${filename} into chunks...`);
const splitDocs = await textSplitter.splitDocuments(docs);

console.log(`Uploading documents to Qdrant...`);
const index = await QdrantVectorStore.fromDocuments(splitDocs, embeddings, {
  url: process.env.QDRANT_URL,
  collectionName: 'qa-docs'
});

console.log('\x1b[36mBot:\x1b[0m Hello! How can I help you?');
while (true) {
  let query = readline.question('\x1b[33mUser:\x1b[0m ');
  const client = await QdrantVectorStore.fromExistingCollection(embeddings, {
    url: process.env.QDRANT_URL,
    collectionName: 'qa-docs'
  });
  let response = await client.similaritySearch(query, 1);
  let output = await answerer(query, response[0].pageContent);
  console.log(`\x1b[36mBot:\x1b[0m ${capitalizeFirstLetter(output.answer)}`);
}
