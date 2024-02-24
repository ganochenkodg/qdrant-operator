# Qdrand Collections backup/restore guide

In this guide, you will configure the management of Qdrant collection snapshots. 
Beyond the obvious use case of backup, this can be beneficial for transferring data to a new Qdrant cluster or creating new test collections with a copy of real data. 
Instant (`spec.snapshots.backupNow`) and scheduled (`spec.snapshots.backupSchedule`) snapshots are both possible. You will create a collection, add data to it, take a snapshot, and restore it to another collection using the `spec.snapshots` parameter in the custom QdrantCollection custom resource. 

Before you begin, it is necessary to create an S3 bucket and generate a pair of access/secret keys for accessing it.

Also, it is necessary to specify the correct endpoint for the S3 service (`spec.snapshots.s3EndpointURL`), for example, `https://storage.googleapis.com/` for GCP or `https://s3.amazonaws.com/` for AWS. 
The access/secret key pair should be stored in a Kubernetes secret (refer it in `spec.snapshots.s3CredentialsSecretName`).

### Google Cloud Storage

1. Create a bucket with a unique name.

```bash
gcloud storage buckets create gs://unique-bucket-for-shapshots
```

2. Create a service account to be used for accessing the bucket.

```bash
gcloud iam service-accounts create bucket-snapshots-sa \
  --display-name="bucket-snapshots-sa"
```

3. Save the email of the created service account in the variable SA_EMAIL.

```bash
export SA_EMAIL=$(gcloud iam service-accounts list \
  --filter="displayName:bucket-snapshots-sa" --format='value(email)')
```

4. Grant access to the bucket for the service account.

```bash
gcloud storage buckets add-iam-policy-binding gs://unique-bucket-for-shapshots \
  --member="serviceAccount:$SA_EMAIL" \
  --role="roles/storage.objectUser"
```

5. Generate credentials for the service account, save the access and secret keys, as they will be needed later.

```bash
gcloud storage hmac create $SA_EMAIL
```

You will get similar output:

```yaml
kind: storage#hmacKey
metadata:
  accessId: ACCESSKEY
  ...
secret: SECRETKEY
```

Save these values.

### Amazon Web Services

1. Follow the [official guide](https://docs.aws.amazon.com/AmazonS3/latest/userguide/example-walkthroughs-managing-access-example1.html) to create a bucket and an IAM user.
2. Don't forget to save the access and secret keys, they will be displayed only once.

### Backup and restore operations

1. Create a Kubernetes secret with credentials for accessing the bucket that will store snapshots.

```bash
kubectl create secret generic bucket-credentials \
  --from-literal=ACCESS_KEY=YOURACCESSKEY \
  --from-literal=SECRET_KEY=YOURSECRETKEY
```

2. Create a new Qdrant cluster. In this example, we will use 3 replicas, API key authentication and TLS encryption for connections.

```bash
cat <<EOF | kubectl apply -f -
apiVersion: qdrant.operator/v1alpha1
kind: QdrantCluster
metadata:
  name: my-cluster
spec:
  replicas: 3
  image: qdrant/qdrant:v1.7.4
  apikey: 'true'
  tls:
    enabled: true
EOF
```

3. Create a new source collection with sharding and replication enabled:

```bash
cat <<EOF | kubectl apply -f -
apiVersion: qdrant.operator/v1alpha1
kind: QdrantCollection
metadata:
  name: source-collection
spec:
  cluster: my-cluster
  vectorSize: 4
  shardNumber: 3
  replicationFactor: 2
EOF
```

4. Start a new client pod with API key and CA certificate mounted from corresponding Secrets:

```bash
cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: Pod
metadata:
  name: qdrantclient
spec:
  containers:
  - image: curlimages/curl
    name: mycurlpod
    command: ["/bin/sh"]
    args: ["-c", "while true; do echo hello; sleep 10;done"]
    env:
    - name: APIKEY
      valueFrom:
        secretKeyRef:
          name: my-cluster-apikey
          key: api-key
    volumeMounts:
      - name: cert
        readOnly: true
        mountPath: "/cert/cacert.pem"
        subPath: cacert.pem
  volumes:
    - name: cert
      secret:
        secretName: my-cluster-server-cert
        items:
          - key: cacert.pem
            path: cacert.pem
EOF
```

5. Connect to the client:

```bash
kubectl exec -it qdrantclient -- sh
```

6. Upload some data to the source collection:

```bash
curl -L -X PUT "https://my-cluster.default:6333/collections/source-collection/points?wait=true" \
    --cacert /cert/cacert.pem \
    -H "api-key: ${APIKEY}" \
    -H "Content-Type: application/json" \
    --data-raw '{
        "points": [
          {"id": 1, "vector": [0.05, 0.61, 0.76, 0.74], "payload": {"city": "Berlin"}},
          {"id": 2, "vector": [0.19, 0.81, 0.75, 0.11], "payload": {"city": "London"}}
        ]
    }'
```

Press `CTRL-D` to exit from the client pod.

7. Add the `.snapshots` section to the source collection for creating an instant backup:

```bash
cat <<EOF | kubectl apply -f -
apiVersion: qdrant.operator/v1alpha1
kind: QdrantCollection
metadata:
  name: source-collection
spec:
  cluster: my-cluster
  vectorSize: 4
  shardNumber: 3
  replicationFactor: 2
  snapshots:
    s3EndpointURL: https://storage.googleapis.com/
    s3CredentialsSecretName: bucket-credentials
    bucketName: unique-bucket-for-shapshots
    backupNow: true
EOF
```

Make sure to replace these settings with your actual S3 endpoint and bucket name.

8. Find newly created backup job and check the logs to ensure it was done:

```bash
kubectl get job
kubectl logs -f job.batch/source-collection-backup-355312
```

```console
Added `S3` successfully.
Saved my-cluster/source-collection/2024-01-23-17-58/my-cluster-0.snapshot
Saved my-cluster/source-collection/2024-01-23-17-58/my-cluster-1.snapshot
Saved my-cluster/source-collection/2024-01-23-17-58/my-cluster-2.snapshot
`/app/my-cluster/source-collection/2024-01-23-17-58/my-cluster-0.snapshot` -> `S3/unique-bucket-for-shapshots/my-cluster/source-collection/2024-01-23-17-58/my-cluster-0.snapshot`
`/app/my-cluster/source-collection/2024-01-23-17-58/my-cluster-1.snapshot` -> `S3/unique-bucket-for-shapshots/my-cluster/source-collection/2024-01-23-17-58/my-cluster-1.snapshot`
`/app/my-cluster/source-collection/2024-01-23-17-58/my-cluster-2.snapshot` -> `S3/unique-bucket-for-shapshots/my-cluster/source-collection/2024-01-23-17-58/my-cluster-2.snapshot`
Total: 110.67 MiB, Transferred: 110.67 MiB, Speed: 2.67 MiB/s
Successfully stored "source-collection" backup in the "unique-bucket-for-shapshots" bucket.
Snapshot name is "my-cluster/source-collection/2024-01-23-17-58".
```

9. Create a new `target` collection with the `.snapshots.restoreSnapshotName` option to make a copy of the source collection:

```bash
cat <<EOF | kubectl apply -f -
apiVersion: qdrant.operator/v1alpha1
kind: QdrantCollection
metadata:
  name: target-collection
spec:
  cluster: my-cluster
  vectorSize: 4
  shardNumber: 3
  replicationFactor: 2
  snapshots:
    s3EndpointURL: https://storage.googleapis.com/
    s3CredentialsSecretName: bucket-credentials
    bucketName: unique-bucket-for-shapshots
    restoreSnapshotName: my-cluster/source-collection/2024-01-23-17-58
EOF
```

10. Find the restore job and check the logs to ensure data was restores successfully:

```bash
kubectl get job
kubectl logs -f job.batch/target-collection-restore-357566
```

```console
Added `S3` successfully.
`S3/unique-bucket-for-shapshots/my-cluster/source-collection/2024-01-23-17-58/my-cluster-0.snapshot` -> `my-cluster/source-collection/2024-01-23-17-58/my-cluster-0.snapshot`
`S3/unique-bucket-for-shapshots/my-cluster/source-collection/2024-01-23-17-58/my-cluster-1.snapshot` -> `my-cluster/source-collection/2024-01-23-17-58/my-cluster-1.snapshot`
`S3/unique-bucket-for-shapshots/my-cluster/source-collection/2024-01-23-17-58/my-cluster-2.snapshot` -> `my-cluster/source-collection/2024-01-23-17-58/my-cluster-2.snapshot`
Total: 110.67 MiB, Transferred: 110.67 MiB, Speed: 3.48 MiB/s
Snapshot my-cluster-0.snapshot restored successfully in time 2.408649.
Snapshot my-cluster-1.snapshot restored successfully in time 3.569833.
Snapshot my-cluster-2.snapshot restored successfully in time 1.762345.
```

11. Connect to the client pod and run some search query over target collection to ensure data is valid:

```bash
kubectl exec -it qdrantclient -- sh
```

```bash
curl -L -X POST "https://my-cluster.default:6333/collections/target-collection/points/search" \
    --cacert /cert/cacert.pem \
    -H "api-key: ${APIKEY}" \
    -H "Content-Type: application/json" \
    --data-raw '{
        "vector": [0.2,0.1,0.9,0.7],
        "top": 1
    }'
```

You should a similar answer:

```console
{"result":[{"id":1,"version":0,"score":0.89463294,"payload":null,"vector":null}],"status":"ok","time":0.014474}
```

Press `CTRL-D` to exec from the client pod.
