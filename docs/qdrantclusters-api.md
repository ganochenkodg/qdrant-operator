# QdrantCluster API Reference

The QdrantCluster custom resource allows you to define and deploy Qdrant clusters in your Kubernetes environment. 
Use this API reference to understand the available parameters and their descriptions.

### Resource Definition

```yaml
apiVersion: qdrant.operator/v1alpha1
kind: QdrantCluster
metadata:
  name: your-cluster-name
spec:
  replicas: 3
  image: qdrant/qdrant:v1.7.3
  apikey: 'true'
  readApikey: 'true'
  config:
    cluster:
      consensus:
        tick_period_ms: 50
  persistence:
    size: 1Gi
    storageClassName: default
  tls:
    enabled: true
  resources:
    requests:
      cpu: 10m
      memory: 100Mi
    limits:
      cpu: 1000m
      memory: 500Mi
  tolerations: []
  nodeAffinity: {}
  podAntiAffinity: {}
  topologySpreadConstraints: []
```

### Parameters

- **replicas** (integer, required): Number of Qdrant cluster replicas to deploy.

- **image** (string, required): Docker image for Qdrant, including version information.

- **apikey** (string, optional): Enable or disable or use user-defined API key authentication for the cluster.

- **readApikey** (string, optional): Enable or disable read-only API key authentication for the cluster.

- **config** (object, optional): Additional configuration for the Qdrant cluster.

- **persistence** (object, optional): Persistence settings for the Qdrant cluster.

  - **size** (string, optional): Size of the storage for persistence (e.g., "1Gi").

  - **storageClassName** (string, optional): Storage class name for persistent volumes.

- **tls** (object, optional): TLS (Transport Layer Security) configuration for the cluster.

  - **enabled** (boolean, optional): Enable or disable TLS for communication within the cluster.

  - **internodeEnabled** (boolean, optional): Enable or disable internode TLS communication.

  - **mtls** (boolean, optional): Enable or disable mutual TLS for secure communication, requires valid client certificate.

  - **secretName** (string, optional): Secret name containing cert.pem, key.pem, and cacert.pem for Server TLS. If not declared, the operator will generate a new CA and certificate.

  - **clientSecretName** (string, optional): Secret name containing cert.pem, key.pem, and cacert.pem for Client TLS. If not declared, the operator will generate a new CA and certificate.


- **resources** (object, optional): Resource requests and limits for the Qdrant cluster.

- **tolerations** (array, optional): Tolerations for the Qdrant cluster.

- **nodeAffinity** (object, optional): Node affinity settings for the Qdrant cluster.

- **podAntiAffinity** (object, optional): Pod anti-affinity settings for the Qdrant cluster.

- **topologySpreadConstraints** (array, optional): Topology spread constraints for the Qdrant cluster.

Feel free to adjust the values based on your specific requirements when creating or updating the QdrantCluster custom resource in your Kubernetes cluster.

