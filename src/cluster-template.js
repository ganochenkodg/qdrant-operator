import yaml from 'js-yaml';
import jsrender from 'jsrender';

// statefulset template
export const clusterTemplate = (apiObj) => {
  var template = jsrender.templates('./templates/statefulset.jsr');
  var persistence = typeof apiObj.spec.persistence !== 'undefined';
  // render yaml with additional boolean for checking persistence
  var jsontemplate = yaml.load(
    template({ ...apiObj, ...{ persistence: persistence } })
  );
  // fill all specific specs if they are defined in the custom resource
  jsontemplate.spec.template.spec.containers[0].resources =
    typeof apiObj.spec.resources !== 'undefined' ? apiObj.spec.resources : {};
  // scheduling specs
  jsontemplate.spec.template.spec.tolerations =
    typeof apiObj.spec.tolerations !== 'undefined'
      ? apiObj.spec.tolerations
      : [];
  jsontemplate.spec.template.spec.topologySpreadConstraints =
    typeof apiObj.spec.topologySpreadConstraints !== 'undefined'
      ? apiObj.spec.topologySpreadConstraints
      : [];
  jsontemplate.spec.template.spec.affinity.nodeAffinity =
    typeof apiObj.spec.nodeAffinity !== 'undefined'
      ? apiObj.spec.nodeAffinity
      : {};
  jsontemplate.spec.template.spec.affinity.podAntiAffinity =
    typeof apiObj.spec.podAntiAffinity !== 'undefined'
      ? apiObj.spec.podAntiAffinity
      : {};
  return jsontemplate;
};

// auth config template
export const clusterAuthSecretTemplate = (apiObj, apikey, readApikey) => {
  var template = jsrender.templates('./templates/secret-auth-config.jsr');
  var jsontemplate = yaml.load(template(apiObj));
  // check if we need to specify read-only apikey in the config
  if (readApikey == 'false') {
    jsontemplate.data['local.yaml'] = btoa('service:\n  api_key: ' + apikey);
  } else {
    jsontemplate.data['local.yaml'] = btoa(
      'service:\n  api_key: ' + apikey + '\n  read_only_api_key: ' + readApikey
    );
  }
  return jsontemplate;
};

// apikey secret template
export const clusterSecretTemplate = (apiObj, apikey) => {
  var template = jsrender.templates('./templates/secret-apikey.jsr');
  var jsontemplate = yaml.load(template(apiObj));
  jsontemplate.data['api-key'] = btoa(apikey);
  return jsontemplate;
};

// read-only apikey secret template
export const clusterReadSecretTemplate = (apiObj, readApikey) => {
  var template = jsrender.templates('./templates/secret-read-apikey.jsr');
  var jsontemplate = yaml.load(template(apiObj));
  jsontemplate.data['api-key'] = btoa(readApikey);
  return jsontemplate;
};

// certificates secret template
export const clusterSecretCertTemplate = (apiObj, cert) => {
  var template = jsrender.templates('./templates/secret-server-cert.jsr');
  var jsontemplate = yaml.load(template(apiObj));
  jsontemplate.data['cert.pem'] = btoa(cert['cert.pem']);
  jsontemplate.data['key.pem'] = btoa(cert['key.pem']);
  jsontemplate.data['cacert.pem'] = btoa(cert['cacert.pem']);
  return jsontemplate;
};

// clustr config template
export const clusterConfigmapTemplate = (apiObj) => {
  var template = jsrender.templates('./templates/configmap.jsr');
  var jsontemplate = yaml.load(template(apiObj));
  // convert spec.config to yaml if defined
  jsontemplate.data['production.yaml'] =
    typeof apiObj.spec.config !== 'undefined'
      ? yaml.dump(apiObj.spec.config)
      : '';
  return jsontemplate;
};

// generic template without additional logic
export const genericTemplate = (apiObj, templatePath) => {
  var template = jsrender.templates(`./templates/${templatePath}`);
  return yaml.load(template(apiObj));
};
