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

Install the operator by running the command below:

```bash
kubectl apply -f https://raw.githubusercontent.com/ganochenkodg/qdrant-operator/main/deploy/operator.yaml
```
