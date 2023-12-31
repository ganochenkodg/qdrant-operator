import yaml from 'js-yaml';
import { Str } from '@supercharge/strings';
import jsrender from 'jsrender';

export const clusterTemplate = (apiObj) => {
  var name = apiObj.metadata.name;

  var template = {
    apiVersion: 'apps/v1',
    kind: 'StatefulSet',
    metadata: {
      name: `${name}`,
      namespace: `${apiObj.metadata.namespace}`,
      labels: {
        clustername: `${name}`,
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

export const clusterSecretTemplate = (apiObj) => {
  var template = jsrender.templates('./templates/secret.jsr');
  var jsontemplate = yaml.load(template(apiObj));
  const apikey =
    apiObj.spec.apikey == true ? Str.random(32) : apiObj.spec.apikey;
  jsontemplate.data['api-key'] = btoa(apikey);
  jsontemplate.data['local.yaml'] = btoa('service:\n  api_key: ' + apikey);
  return jsontemplate;
};

export const clusterServiceHeadlessTemplate = (apiObj) => {
  var template = jsrender.templates('./templates/service-headless.jsr');
  return yaml.load(template(apiObj));
};

export const clusterServiceTemplate = (apiObj) => {
  var template = jsrender.templates('./templates/service.jsr');
  return yaml.load(template(apiObj));
};

export const clusterConfigmapTemplate = (apiObj) => {
  var template = jsrender.templates('./templates/configmap.jsr');
  var jsontemplate = yaml.load(template(apiObj));
  jsontemplate.data['production.yaml'] =
    typeof apiObj.spec.config !== 'undefined'
      ? yaml.dump(apiObj.spec.config)
      : '';
  return jsontemplate;
};
