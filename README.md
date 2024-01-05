<p style="text-align:center;" align="center">
  <img src="resources/logo.png" width="200"/></a>  
</p>

# qdrant-operator
Kubernetes operator for Qdrant

## Quickstart

### Prerequisite

The operator includes two custom resources - `QdrantCluster` and `QdrantCollection`. Install the CRDs by running the commands below:

```bash
kubectl apply -f https://raw.githubusercontent.com/ganochenkodg/qdrant-operator/main/deploy/crds/crd-qdrantcluster.yaml
kubectl apply -f https://raw.githubusercontent.com/ganochenkodg/qdrant-operator/main/deploy/crds/crd-qdrantcollection.yaml
```

You will see the next output:

```console
customresourcedefinition.apiextensions.k8s.io/qdrantclusters.qdrant.operator created
customresourcedefinition.apiextensions.k8s.io/qdrantcollections.qdrant.operator created
```

Install the operator by running the command below:

```bash
kubectl apply -f https://raw.githubusercontent.com/ganochenkodg/qdrant-operator/main/deploy/operator.yaml
```

```console
namespace/qdrant-operator created
serviceaccount/qdrant-operator-sa created
clusterrole.rbac.authorization.k8s.io/qdrant-operator-role created
clusterrolebinding.rbac.authorization.k8s.io/qdrant-operator-rolebinding created
configmap/qdrant-operator-config created
deployment.apps/qdrant-operator created
```

Wait for operator's readiness:

```bash
kubectl wait pods -l app=qdrant-operator --for condition=Ready --timeout=300s -n qdrant-operator
```

And check operator's logs to ensure it is working:

```bash
kubectl logs deploy/qdrant-operator -n qdrant-operator
```

```console
1/5/2024, 12:10:16 AM: Debug mode ON!
1/5/2024, 12:10:16 AM: Watching QdrantClusters API.
1/5/2024, 12:10:16 AM: Watching QdrantCollections API.
```

### Usage

At first let's deploy the first Qdrant cluster by applying the minimal QdrantCluster custom resource:

```bash
cat <<EOF | kubectl apply -f -
apiVersion: qdrant.operator/v1alpha1
kind: QdrantCluster
metadata:
  name: my-cluster
spec:
  replicas: 1
  image: qdrant/qdrant:v1.7.3
EOF
```

```console
qdrantcluster.qdrant.operator/my-cluster created
```

Check operator's logs to ensure cluster is running now:

```console
1/5/2024, 12:14:27 AM: Received event in phase ADDED.
1/5/2024, 12:14:28 AM: The cluster "my-cluster" status now is Pending.
1/5/2024, 12:14:29 AM: ConfigMap "my-cluster" is not available. Creating...
1/5/2024, 12:14:29 AM: ConfigMap "my-cluster" was successfully created!
1/5/2024, 12:14:29 AM: Service "my-cluster-headless" is not available. Creating...
1/5/2024, 12:14:29 AM: Service "my-cluster-headless" was successfully created!
1/5/2024, 12:14:29 AM: Service "my-cluster" is not available. Creating...
1/5/2024, 12:14:29 AM: Service "my-cluster" was successfully created!
1/5/2024, 12:14:29 AM: StatefulSet "my-cluster" is not available. Creating...
1/5/2024, 12:14:29 AM: StatefulSet "my-cluster" was successfully created!
1/5/2024, 12:14:34 AM: Cluster "my-cluster" is not ready: 0/1 are available.
1/5/2024, 12:14:39 AM: Cluster "my-cluster" is not ready: 0/1 are available.
1/5/2024, 12:14:44 AM: Cluster "my-cluster" is not ready: 0/1 are available.
1/5/2024, 12:14:49 AM: Cluster "my-cluster" is not ready: 0/1 are available.
1/5/2024, 12:14:54 AM: Cluster "my-cluster" is ready!
1/5/2024, 12:14:54 AM: The cluster "my-cluster" status now is Running.
```

There are two mandatory parameters - `replicas` and `image`. You can check minimal and complete YAMl manifests in the [examples](examples) folder.

By default there are no replication, resources, data persistence and scheduling options configured.

Now create your first vector [collection](https://qdrant.tech/documentation/concepts/collections/):

```bash
cat <<EOF | kubectl apply -f -
apiVersion: qdrant.operator/v1alpha1
kind: QdrantCollection
metadata:
  name: my-collection
spec:
  cluster: my-cluster
  vectorSize: 10
EOF
```

```console
qdrantcollection.qdrant.operator/my-collection created
```

Check logs:

```console
1/5/2024, 12:19:43 AM: Received event in phase ADDED.
1/5/2024, 12:19:43 AM: Trying to create a Collection "my-collection" in the Cluster "my-cluster"...
1/5/2024, 12:19:44 AM: Status: ""ok"", time: "0.311443".
```

There are two mandatory parameters - `cluster` with the cluster reference and `vectorSize`. Minimal and complete manifests are also stored in the [examples](examples) folder.

By default disk storage is not configured and will use global cluster parameters, and shards number and replication factor are configured to `1` both.

## Why not Helm chart

The official [Qdrant Helm chart](https://github.com/qdrant/qdrant-helm) doesn't allow to manage collections, and its functionality is restricted to configure cluster resources only.

## Disclaimer of Warranty

Please note that the Qdrant operator currently is under development and new releases might contain bugs and breaking changes. The operator is not affiliated with [Qdrant](https://github.com/qdrant/).
