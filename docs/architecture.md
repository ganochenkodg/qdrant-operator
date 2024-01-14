# Architecture

![operator_diagram](../resources/qdrant-operator-architecture.svg)

The Qdrant operator consists of the following components:

- Operator Deployment with 3 replicas (leader elections are performed using Kubernetes Leases).
- ConfigMap with operator parameters.
- Role => RoleBinding => ServiceAccount with necessary permissions for operation.

The required Kubernetes version is 1.26 or higher.
