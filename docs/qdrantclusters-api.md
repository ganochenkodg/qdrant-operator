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
  image: qdrant/qdrant:v1.20.2
  apikey: 'true'
  readApikey: 'true'
  jwtRbac: true
  probes:
    readiness:
      enabled: true
    liveness:
      enabled: true
    startup:
      enabled: true
      failureThreshold: 30
  podSecurityContext:
    fsGroup: 3000
    fsGroupChangePolicy: Always
  securityContext:
    runAsNonRoot: true
    runAsUser: 1000
    runAsGroup: 2000
    allowPrivilegeEscalation: false
    readOnlyRootFilesystem: true
    capabilities:
      drop: ["ALL"]
  config:
    cluster:
      consensus:
        tick_period_ms: 50
    storage:
      performance:
        io_uring: auto
  persistence:
    size: 1Gi
    # storageClassName: standard
    accessModes: ["ReadWriteOnce"]
  tls:
    enabled: true
  sidecarContainers:
  - name: nginx
    image: nginx:1.25
    ports:
    - containerPort: 80
  additionalVolumes:
  - name: qdrant-newfolder
    emptyDir: {}
  additionalVolumeMounts:
  - name: qdrant-newfolder
    mountPath: /qdrant/newfolder
  env:
  - name: QDRANT__LOG_LEVEL
    value: INFO
  envFrom: []
  resources:
    requests:
      cpu: 10m
      memory: 100Mi
    limits:
      cpu: 1000m
      memory: 500Mi
  nodeSelector: {}
  tolerations: []
  nodeAffinity: {}
  podAntiAffinity: {}
  topologySpreadConstraints: []
  podAnnotations: {}
  podLabels: {}
```

### Parameters

- **replicas** (integer, required): Number of Qdrant cluster replicas to deploy.
- **image** (string, required): Docker image for Qdrant, including version tag (e.g., `qdrant/qdrant:v1.20.2`).
- **apikey** (string, optional): `'false'`, `'true'` (auto-generated), or a custom read-write API key.
- **readApikey** (string, optional): `'false'`, `'true'` (auto-generated), or a custom read-only API key (requires `apikey` enabled).
- **jwtRbac** (boolean, optional, default `false`): Enable Qdrant JWT RBAC (`service.jwt_rbac: true`, requires `apikey` enabled).
- **config** (object, optional): Custom Qdrant configuration rendered into `production.yaml` (e.g., consensus, `io_uring`, quotas, audit logs, native S3 snapshots).
- **probes** (object, optional): HTTP/HTTPS probe configuration for the Qdrant container (automatically uses `HTTPS` when TLS is enabled):
  - **readiness**: Enabled by default (`GET /readyz`).
  - **liveness**: Disabled by default (`GET /livez`).
  - **startup**: Disabled by default (`GET /readyz`, default `failureThreshold: 30`).
- **podSecurityContext** (object, optional): Pod-level `securityContext` (e.g., `fsGroup`).
- **securityContext** (object, optional): Container-level `securityContext` for the Qdrant container (`runAsNonRoot`, `readOnlyRootFilesystem`, etc.).
- **persistence** (object, optional): Persistence settings for the Qdrant cluster:
  - **size** (string, required if `persistence` set): Storage size (e.g., `"10Gi"`).
  - **storageClassName** (string, optional): StorageClass name; omit to use the cluster default StorageClass.
  - **accessModes** (array, optional, default `["ReadWriteOnce"]`): PVC access modes.
- **tls** (object, optional): TLS configuration for client and internode connections:
  - **enabled** (boolean, optional, default `false`): Enable or disable TLS.
  - **secretName** (string, optional): Existing Secret with `cert.pem`, `key.pem`, and `cacert.pem`. If omitted, the operator generates a CA and server certificate.
- **service** (string, optional, default `ClusterIP`): Kubernetes Service type (`ClusterIP`, `NodePort`, `LoadBalancer`).
- **serviceAccountName** (string, optional): Custom ServiceAccount for Qdrant pods.
- **imagePullSecrets** (array, optional): Image pull secrets for private registries.
- **env** / **envFrom** (array, optional): Extra environment variables or `envFrom` sources (e.g., Secrets for native S3 snapshot credentials).
- **sidecarContainers** (array, optional): Additional sidecar containers in the Qdrant Pod.
- **additionalVolumes** / **additionalVolumeMounts** (array, optional): Extra Pod volumes and Qdrant container volume mounts.
- **resources** (object, optional): CPU/memory requests and limits for the Qdrant container.
- **nodeSelector**, **tolerations**, **nodeAffinity**, **podAntiAffinity**, **topologySpreadConstraints** (optional): Kubernetes scheduling options.
- **podAnnotations** / **podLabels** (object, optional): Extra annotations and labels for Qdrant pods.
