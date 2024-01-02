import yaml from 'js-yaml';
import { Str } from '@supercharge/strings';
import jsrender from 'jsrender';

export const clusterTemplate = (apiObj) => {
  var template = jsrender.templates('./templates/statefulset.jsr');
  console.log(template(apiObj));
  return yaml.load(template(apiObj));
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

export const clusterSecretCertTemplate = (apiObj, cert) => {
  var template = jsrender.templates('./templates/secret-server-cert.jsr');
  var jsontemplate = yaml.load(template(apiObj));
  jsontemplate.data['cert.pem'] = btoa(cert['cert.pem']);
  jsontemplate.data['key.pem'] = btoa(cert['key.pem']);
  jsontemplate.data['cacert.pem'] = btoa(cert['cacert.pem']);
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

export const clusterPdbTemplate = (apiObj) => {
  var template = jsrender.templates('./templates/pdb.jsr');
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
