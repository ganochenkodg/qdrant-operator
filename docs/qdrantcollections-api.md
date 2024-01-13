# QdrantCollection API Reference

The QdrantCollection custom resource allows you to define and configure Qdrant collections within your QdrantCluster in the Kubernetes environment.

### Resource Definition

```yaml
apiVersion: qdrant.operator/v1alpha1
kind: QdrantCollection
metadata:
  name: your-collection-name
spec:
  cluster: your-cluster-name
  vectorSize: 10
  onDisk: true
  shardNumber: 6
  replicationFactor: 2
```

### Parameters

- **cluster** (string, required): Name of the QdrantCluster to which the collection belongs.

- **vectorSize** (integer, required): Size of the vectors in the collection.

- **onDisk** (boolean, optional): Indicates whether the collection should be stored on disk.

- **shardNumber** (integer, optional): Number of shards for the collection. Default values is 1.

- **replicationFactor** (integer, optional): Number of replicas for each shard in the collection.

- **config** (object, optional): Additional configuration for the Qdrant collection, including [indexing](https://qdrant.tech/documentation/concepts/indexing/#vector-index), [quantization](https://qdrant.tech/documentation/guides/quantization/) and [optimizer](https://qdrant.tech/documentation/concepts/optimizer/) parameters.

Feel free to customize the values based on your specific requirements when creating or updating the QdrantCollection custom resource in your Kubernetes cluster.
