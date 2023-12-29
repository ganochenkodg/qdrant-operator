import { log } from './index.js';
import { clusterTemplate } from './cluster-template.js';

export const applyCluster = async (apiObj, k8sCoreApi) => {
  var newClusterTemplate = clusterTemplate(apiObj);
  console.log(newClusterTemplate);
};
