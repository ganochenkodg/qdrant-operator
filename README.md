<p style="text-align:center;" align="center">
  <img src="resources/logo.png" width="200"/></a>  
</p>

# qdrant-operator
Kubernetes operator for the [Qdrant](https://github.com/qdrant/qdrant) Vector Database.

## Operator features

The operator provides the following functionality:

- Creation of single-node and multi-node Qdrant clusters (distributed mode is automatically enabled when using multiple replicas).
- Authentication support in the cluster using API keys with read-write and read-only permissions. Auto-generated and user-provided keys are supported.
- TLS Encryption support for connections, both for client and peer-to-peer communication. Auto-generated and user-provided certificates are supported.
- Support for setting custom Qdrant parameters.
- Support for setting various scheduling options for the cluster (tolerations, affinities, topology spread).
- Management of Qdrant collections, including configuration of replication, sharding, indexing, quantization, etc.
- The operator works in cluster mode with leader elections, ensuring high availability.

## Getting started

### Installation

To run the operator you need Kubernetes version 1.26+.

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
Found 3 pods, using pod/qdrant-operator-6577f85799-ggkgm
1/14/2024, 3:58:40 PM: Debug mode ON!
1/14/2024, 3:58:40 PM: Status of "qdrant-operator-6577f85799-ggkgm": FOLLOWER. Trying to get leader status...
1/14/2024, 3:58:41 PM: Status of "qdrant-operator-6577f85799-ggkgm": LEADER.
1/14/2024, 3:58:41 PM: Watching QdrantClusters API.
1/14/2024, 3:58:41 PM: Watching QdrantCollections API.
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
1/14/2024, 3:59:24 PM: Received event in phase ADDED.
1/14/2024, 3:59:25 PM: The cluster "my-cluster" status now is Pending.
1/14/2024, 3:59:25 PM: ConfigMap "my-cluster" is not available. Creating...
1/14/2024, 3:59:25 PM: ConfigMap "my-cluster" was successfully created!
1/14/2024, 3:59:25 PM: Service "my-cluster-headless" is not available. Creating...
1/14/2024, 3:59:25 PM: Service "my-cluster-headless" was successfully created!
1/14/2024, 3:59:26 PM: Service "my-cluster" is not available. Creating...
1/14/2024, 3:59:26 PM: Service "my-cluster" was successfully created!
1/14/2024, 3:59:26 PM: StatefulSet "my-cluster" is not available. Creating...
1/14/2024, 3:59:26 PM: StatefulSet "my-cluster" was successfully created!
1/14/2024, 3:59:31 PM: Cluster "my-cluster" is not ready: 0/1 are available.
1/14/2024, 3:59:36 PM: Cluster "my-cluster" is not ready: 0/1 are available.
1/14/2024, 3:59:41 PM: Cluster "my-cluster" is ready!
1/14/2024, 3:59:41 PM: The cluster "my-cluster" status now is Running.
```

There are two mandatory parameters - `replicas` and `image`. You can check minimal and complete YAML manifests in the [examples](examples) folder.

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
1/14/2024, 4:01:43 PM: Received event in phase ADDED.
1/14/2024, 4:01:43 PM: Trying to create a Collection "my-collection" in the Cluster "my-cluster"...
1/14/2024, 4:01:44 PM: Status: ""ok"", time: "0.311443".
```

There are two mandatory parameters - `cluster` with the cluster reference and `vectorSize`. Minimal and complete manifests are also stored in the [examples](examples) folder.

By default disk storage is not configured and will use global cluster parameters, and shards number and replication factor are configured to `1` both.

### Documentation

Guides:

- [TLS usage](docs/tls.md)
- [Authentication](docs/authentication.md)
- [Cluster architecture](docs/architecture.md)
- [QdrantClusters API reference](docs/qdrantclusters-api.md)
- [QdrantCollections API reference](docs/qdrantcollections-api.md)

YAML examples:

- [Minimal Qdrant cluster](examples/qdrant-cluster-minimal.yaml)
- [Qdrant cluster with authentication](examples/qdrant-cluster-apikey.yaml)
- [Qdrant cluster with TLS](examples/qdrant-cluster-tls.yaml)
- [Complete Qdrant cluster](examples/qdrant-cluster-complete.yaml)
- [Minimal Qdrant collection](examples/qdrant-collection-minimal.yaml)
- [Qdrant collection with replication](examples/qdrant-collection-replication.yaml)
- [Complete Qdrant collection](examples/qdrant-collection-complete.yaml)

## Why not Helm chart

The official [Qdrant Helm chart](https://github.com/qdrant/qdrant-helm) doesn't allow to manage collections, and its functionality is restricted to configure cluster resources only.

## Getting help

If you encounter any issues while using Qdrant-operator, you can get help using [Github issues](https://github.com/ganochenkodg/qdrant-operator/issues).

## Disclaimer of Warranty

Please note that the Qdrant operator currently is under development and new releases might contain bugs and breaking changes. The operator is not affiliated with [Qdrant](https://github.com/qdrant/).
