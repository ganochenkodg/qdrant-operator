export const clusterTemplate = (apiObj) => {
  var name = apiObj.metadata.name;

  var template = {
    apiVersion: 'apps/v1',
    kind: 'StatefulSet',
    metadata: {
      name: `${apiObj.metadata.name}`,
      namespace: `${apiObj.metadata.namespace}`,
      labels: {
        clustername: `${apiObj.metadata.name}`,
        component: 'qdrant'
      }
    },
    spec: {
      replicas: `${apiObj.spec.replicas}`
    }
  };
  /*
  var template = {
    apiVersion: 'v1',
    kind: 'Secret',
    type: `${typeof apiObj.type !== 'undefined' ? apiObj.type : 'Opaque'}`,
    metadata: {
      name: `${apiObj.metadata.name}`,
      namespace: `${apiObj.metadata.namespace}`
    },
    data: {}
  };
  template.data = apiObj.data;
  */

  return template;
};
