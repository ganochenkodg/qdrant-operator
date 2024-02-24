# Qdrant Authentication Guide

In this guide you create a Qdrant cluster with two api keys: the first one with full permissions and the second one for read-only operations.

1. Create Qdrant Cluster

```bash
cat <<EOF | kubectl apply -f -
apiVersion: qdrant.operator/v1alpha1
kind: QdrantCluster
metadata:
  name: my-auth-cluster
spec:
  replicas: 1
  image: qdrant/qdrant:v1.7.4
  apikey: 'true'
  readApikey: 'true'
EOF
```

2. Create a new collection to upload some data:

```bash
cat <<EOF | kubectl apply -f -
apiVersion: qdrant.operator/v1alpha1
kind: QdrantCollection
metadata:
  name: my-auth-collection
spec:
  cluster: my-auth-cluster
  vectorSize: 4
EOF
```

3. Start a new pod with both api keys mounted from corresponding Secrets:

```bash
cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: Pod
metadata:
  name: authclient
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
          name: my-auth-cluster-apikey
          key: api-key
    - name: READ_APIKEY
      valueFrom:
        secretKeyRef:
          name: my-auth-cluster-read-apikey
          key: api-key
EOF
```

```bash
kubectl exec -it authclient -- sh
```

4. Try to upload some vectors using read-only apikey:

```bash
curl -L -X PUT "http://my-auth-cluster.default:6333/collections/my-auth-collection/points?wait=true" \
    -H "Content-Type: application/json" \
    -H "api-key: ${READ_APIKEY}" \
    --data-raw '{
        "points": [
          {"id": 1, "vector": [0.05, 0.61, 0.76, 0.74], "payload": {"city": "Berlin"}},
          {"id": 2, "vector": [0.19, 0.81, 0.75, 0.11], "payload": {"city": "London"}}
        ]
    }'
```

You will get an error:

```console
Invalid api-key
```

5. Upload vectors using read-write apikey:

```bash
curl -L -X PUT "http://my-auth-cluster.default:6333/collections/my-auth-collection/points?wait=true" \
    -H "Content-Type: application/json" \
    -H "api-key: ${APIKEY}" \
    --data-raw '{
        "points": [
          {"id": 1, "vector": [0.05, 0.61, 0.76, 0.74], "payload": {"city": "Berlin"}},
          {"id": 2, "vector": [0.19, 0.81, 0.75, 0.11], "payload": {"city": "London"}}
        ]
    }'
```

You should see a similar output:

```console
{"result":{"operation_id":0,"status":"completed"},"status":"ok","time":0.007165}
```

6. Check if read-only apikey can run search queries:

```bash
curl -L -X POST "http://my-auth-cluster.default:6333/collections/my-auth-collection/points/search" \
    -H "Content-Type: application/json" \
    -H "api-key: $READ_APIKEY" \
    --data-raw '{
        "vector": [0.2,0.1,0.9,0.7],
        "top": 1
    }'
```

Now you will get a good answer, because it's a read-only operation:

```console
{"result":[{"id":1,"version":0,"score":0.89463294,"payload":null,"vector":null}],"status":"ok","time":0.001832}
```

7. Press `CTRL-D` to exit the pod shell.
