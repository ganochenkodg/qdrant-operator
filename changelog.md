# Changelog

## qdrant-operator-0.4.0 (2026-11-23)

- **Dependencies & Runtime:** Upgraded to Node.js 24 LTS, `@kubernetes/client-node` v2, `js-yaml` v5, `eta` v4.6 (replacing `jsrender`), `ava` v8, `prettier` v3.10; removed `@supercharge/strings` and `@nullplatform/k8s-lease-lock` (replaced with native `LeaseLeaderElection`).
- **Reliability & Bugfixes:** Switched to `k8s.makeInformer`, per-resource debounce & `metadata.generation` deduplication, `StrategicMergePatch` for StatefulSet/Service updates, strict 404 checks, PDB cleanup on scale-down to 1 replica, CronJob cleanup on cleared schedule, `execFile` + temp dir cleanup for cert generation, removed `NODE_TLS_REJECT_UNAUTHORIZED=0` in favor of per-cluster CA verification (including backup/restore Jobs), fixed `backup.sh`/`restore.sh` error handling & snapshot cleanup, added `/healthz` and `/readyz` probes to operator Deployment.
- **Qdrant v1.20 Support:**
  - `QdrantCluster`: HTTP/HTTPS `/readyz` + `/livez` + `startupProbe` (`spec.probes`), `podSecurityContext`, `securityContext`, `jwtRbac`, `nodeSelector`, `serviceAccountName`, `imagePullSecrets`, `env`, `envFrom`, `podAnnotations`, `podLabels`, `persistence.accessModes`.
  - `QdrantCollection`: `distance`, `datatype`, `vectors` (named & multi-vectors), `sparseVectors`, `payloadIndexes`, `status` subresource (`Ready`/`Error`, `observedGeneration`) and `kubectl` printer columns.
- **CI/CD:** Split automatic unit CI (`ci.yml`), manual `/run_e2e` kind E2E workflow (`e2e.yml`), and multi-arch release workflow with Trivy scanning (`release.yml`).

## qdrant-operator-0.3.2 (2024-02-05)

- Added new specs: sidecarContainers, additionalVolumes, additionalVolumeMounts
- Added unit tests with AVA

## qdrant-operator-0.3.1 (2024-01-27)

Merged similar template functions into one generic

## qdrant-operator-0.3.0 (2024-01-23)

Added new `.snapshots` feature to manage collection backups.

## qdrant-operator-0.2.3 (2024-01-18)

- Fixed Qdrant cluster scaling 1 => N replicas
- Added background checker for lease ownership
- Bugfixes in the setStatus function

## qdrant-operator-0.2.2 (2024-01-17)

Small bugfixes.

## qdrant-operator-0.2.1 (2024-01-15)

Added graceful shutdown, leasing parameters were slightly tuned.

## qdrant-operator-0.2.0 (2024-01-14)

The operator is working now in cluster mode (leader elections are performed by Kubernetes Leases).

## qdrant-operator-0.1.5 (2024-01-13)

Added support for additional collection params with the `spec.config` spec. See the example: [qdrant-collection-complete.yaml](examples/qdrant-collection-complete.yaml).

## qdrant-operator-0.1.4 (2024-01-12)

- Refactor the settingStatus function code.
- TLS now includes encryption for both client and internode connections. Change the certificate generation method.
- Resolve the event race between operator replicas.

## qdrant-operator-0.1.3 (2024-01-11)

Small bugfixes.

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
