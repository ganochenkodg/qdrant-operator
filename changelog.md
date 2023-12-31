# Changelog

## qdrant-operator-0.1.2 (2024-01-10)

Operator supports now to generate read-write and read-only apikeys with spec.apikey and spec.readApikey parameters. 
Check the [authentication guide](docs/authentication.md) for getting more information.

## qdrant-operator-0.1.1 (2024-01-07)

Using multiple replicas now automatically enables cluster mode and doesn't require for additional config.

Cluster specs previously:

```yaml
apiVersion: qdrant.operator/v1alpha1
kind: QdrantCluster
metadata:
  name: my-cluster
spec:
  replicas: 3
  config:
    cluster:
      enabled: true
```

Cluster specs now:

```yaml
apiVersion: qdrant.operator/v1alpha1
kind: QdrantCluster
metadata:
  name: my-cluster
spec:
  replicas: 3
```

## qdrant-operator-0.1.0 (2024-01-05)

- First initial release
- Allow to create single- and multi-node Qdrant clusters (cluster.enabled = true still should be declared in the config section).
- Allow to create, update and delete vector collections.
