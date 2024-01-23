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
  snapshots:
    s3EndpointURL: https://storage.googleapis.com/
    # s3EndpointURL: https://s3.amazonaws.com
    s3CredentialsSecretName: bucket-credentials
    bucketName: unique-bucket-for-shapshots
    backupNow: true
    # backupSchedule: "0 0 * * *"
    # restoreSnapshotName: my-cluster/my-collection/2024-01-21-23-38
```

### Parameters

- **cluster** (string, required): Name of the QdrantCluster to which the collection belongs.

- **vectorSize** (integer, required): Size of the vectors in the collection.

- **onDisk** (boolean, optional): Indicates whether the collection should be stored on disk.

- **shardNumber** (integer, optional): Number of shards for the collection. Default values is 1.

- **replicationFactor** (integer, optional): Number of replicas for each shard in the collection.

- **config** (object, optional): Additional configuration for the Qdrant collection, including [indexing](https://qdrant.tech/documentation/concepts/indexing/#vector-index), [quantization](https://qdrant.tech/documentation/guides/quantization/) and [optimizer](https://qdrant.tech/documentation/concepts/optimizer/) parameters.

- snapshots (object, optional): Snapshot settings for the collection.

  - s3EndpointURL (string, required): The endpoint of the S3 storage service. Supports multiple Cloud providers, such as Google Cloud Storage and Amazon S3.

  - s3CredentialsSecretName (string, required): The name of the Kubernetes Secret containing the credentials (e.g., access key, secret key) required to access the S3 storage service.

  - bucketName (string, required): The unique name of the bucket where snapshots are stored.

  - backupNow (boolean, optional): A boolean indicating whether to create a backup immediately.

  - backupSchedule (string, optional): A cron expression specifying the schedule for automated backups. For example, "0 0 \* \* \*" will run backup every midnight.

  - restoreSnapshotName (string, optional): The name of the snapshot to be restored. It includes the cluster name, collection name and timestamp.

Feel free to customize the values based on your specific requirements when creating or updating the QdrantCollection custom resource in your Kubernetes cluster.
