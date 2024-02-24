# Qdrant TLS Guide

In this guide you create a Qdrant cluster with enabled TLS encryption.

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
  tls:
    enabled: true
EOF
```

2. Create a new collection to check if operator can connect to the cluster:

```bash
cat <<EOF | kubectl apply -f -
apiVersion: qdrant.operator/v1alpha1
kind: QdrantCluster
metadata:
  name: my-notls-cluster
spec:
  replicas: 1
  image: qdrant/qdrant:v1.7.4
EOF
```

3. Start a new pod with a Certificate Authority, mounted as a volume from the Kubernetes secret:

```bash
cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: Pod
metadata:
  name: tlsclient
spec:
  containers:
  - image: curlimages/curl
    name: mycurlpod
    command: ["/bin/sh"]
    args: ["-c", "while true; do echo hello; sleep 10;done"]
    volumeMounts:
      - name: cert
        readOnly: true
        mountPath: "/cert/cacert.pem"
        subPath: cacert.pem
  volumes:
    - name: cert
      secret:
        secretName: my-tls-cluster-server-cert
        items:
          - key: cacert.pem
            path: cacert.pem
EOF
```

4. Wait for the pod readiness and connect to it:

```bash
kubectl wait pods tlsclient --for condition=Ready --timeout=300s
kubectl exec -it tlsclient -- sh
```

5. Request the collection list to check if HTTPS works:

```bash
curl --cacert /cert/cacert.pem https://my-tls-cluster.default:6333/collections
```

You will see a similar output:

```console
{"result":{"collections":[{"name":"my-tls-collection"}]},"status":"ok","time":0.000017}
```

6. Press `CTRL-D` to exit the pod shell.

You can also use your own certificates by setting the `spec.tls.parameter` to the name of the secret, which contains the files `cert.pem`, `key.pem` and `cacert.pem`. 
Self-signed certificates can't be used because Qdrant verifies certificates using CA during peer-to-peer communication.

