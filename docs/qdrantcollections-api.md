# QdrantCollection API Reference

The QdrantCollection custom resource allows you to define and configure Qdrant collections within your QdrantCluster in Kubernetes.

### Resource Definition

```yaml
apiVersion: qdrant.operator/v1alpha1
kind: QdrantCollection
metadata:
  name: your-collection-name
spec:
  cluster: your-cluster-name
  vectorSize: 384
  distance: Cosine
  datatype: float32
  onDisk: true
  shardNumber: 6
  replicationFactor: 2
  sparseVectors:
    bm25:
      modifier: idf
  payloadIndexes:
    - fieldName: category
      fieldSchema: keyword
    - fieldName: description
      fieldSchema:
        type: text
        tokenizer: word
        lowercase: true
  snapshots:
    s3EndpointURL: https://storage.googleapis.com/
    # s3EndpointURL: https://s3.amazonaws.com
    s3CredentialsSecretName: bucket-credentials
    bucketName: unique-bucket-for-snapshots
    backupNow: true
    # backupSchedule: "0 0 * * *"
    # restoreSnapshotName: my-cluster/my-collection/2024-01-21-23-38
```

### Parameters

- **cluster** (string, required): Name of the `QdrantCluster` to which the collection belongs.
- **vectorSize** (integer, optional): Dimension of unnamed single-vector config (at least one of `vectorSize`, `vectors`, or `sparseVectors` is required).
- **distance** (string, optional, default `"Cosine"`): Distance metric (`Cosine`, `Euclid`, `Dot`, `Manhattan`).
- **datatype** (string, optional): Vector storage datatype (`float32`, `float16`, `uint8`, `turbo4`, `turbo8`, `turbo16`).
- **vectors** (object, optional): Named vectors or multi-vector (ColBERT) configuration. Overrides `vectorSize`/`distance`/`onDisk`/`datatype`.
- **sparseVectors** (object, optional): Sparse vectors configuration for hybrid search (mapped to Qdrant `sparse_vectors`).
- **payloadIndexes** (array, optional): Payload indexes to ensure via `PUT /collections/{name}/index` (supports string schemas like `keyword` or full schema objects like BM25 full-text and nested fields `offers[].description`).
- **onDisk** (boolean, optional, default `true`): Whether unnamed vectors are stored on disk.
- **shardNumber** (integer, optional, default `1`): Number of shards for the collection.
- **replicationFactor** (integer, optional, default `1`): Number of replicas for each shard.
- **config** (object, optional): Additional Qdrant collection parameters (`hnsw_config`, `optimizers_config`, `quantization_config`, `strict_mode_config`, etc.).
- **snapshots** (object, optional): S3 snapshot backup/restore configuration (`s3EndpointURL`, `s3CredentialsSecretName`, `bucketName`, `backupNow`, `backupSchedule`, `restoreSnapshotName`).

### Status

The operator reports reconciliation status in `.status`:
- **collectionStatus**: `Ready` or `Error` (shown by `kubectl get qdrantcollections`).
- **message**: `ok` or the error details.
- **observedGeneration**: Last reconciled `metadata.generation`.
