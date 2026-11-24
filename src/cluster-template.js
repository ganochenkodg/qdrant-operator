import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Eta } from 'eta';
import * as yaml from 'js-yaml';
import { toBase64 } from './k8s-utils.js';

const templatesDir = join(dirname(fileURLToPath(import.meta.url)), 'templates');
const eta = new Eta({
  views: templatesDir,
  autoEscape: false,
  autoTrim: false,
  cache: true
});

// Helm-style helper: serialize a JS object/array as YAML indented by N spaces
const toYaml = (value, spaces = 0) =>
  yaml
    .dump(value, { lineWidth: -1 })
    .trimEnd()
    .split('\n')
    .map((line) => `${' '.repeat(spaces)}${line}`)
    .join('\n');

const renderYaml = (templateName, data) =>
  yaml.load(eta.render(`./${templateName}`, { ...data, toYaml }));

// statefulset template
export const clusterTemplate = (apiObj) => {
  const persistence = typeof apiObj.spec.persistence !== 'undefined';
  const probeScheme = apiObj.spec.tls?.enabled ? 'HTTPS' : 'HTTP';
  return renderYaml('statefulset', { ...apiObj, persistence, probeScheme });
};

// auth config template (supports api_key, read_only_api_key, jwt_rbac)
export const clusterAuthSecretTemplate = (apiObj, apikey, readApikey) => {
  const jsontemplate = renderYaml('secret-auth-config', apiObj);
  const serviceConfig = { api_key: apikey };
  if (readApikey !== 'false') {
    serviceConfig.read_only_api_key = readApikey;
  }
  if (apiObj.spec.jwtRbac) {
    serviceConfig.jwt_rbac = true;
  }
  jsontemplate.data['local.yaml'] = toBase64(
    yaml.dump({ service: serviceConfig })
  );
  return jsontemplate;
};

// apikey secret template
export const clusterSecretTemplate = (apiObj, apikey) => {
  const jsontemplate = renderYaml('secret-apikey', apiObj);
  jsontemplate.data['api-key'] = toBase64(apikey);
  return jsontemplate;
};

// read-only apikey secret template
export const clusterReadSecretTemplate = (apiObj, readApikey) => {
  const jsontemplate = renderYaml('secret-read-apikey', apiObj);
  jsontemplate.data['api-key'] = toBase64(readApikey);
  return jsontemplate;
};

// certificates secret template
export const clusterSecretCertTemplate = (apiObj, cert) => {
  const jsontemplate = renderYaml('secret-server-cert', apiObj);
  jsontemplate.data['cert.pem'] = toBase64(cert['cert.pem']);
  jsontemplate.data['key.pem'] = toBase64(cert['key.pem']);
  jsontemplate.data['cacert.pem'] = toBase64(cert['cacert.pem']);
  return jsontemplate;
};

// cluster config template
export const clusterConfigmapTemplate = (apiObj) => {
  const jsontemplate = renderYaml('configmap', apiObj);
  jsontemplate.data['production.yaml'] =
    typeof apiObj.spec.config !== 'undefined'
      ? yaml.dump(apiObj.spec.config)
      : '';
  return jsontemplate;
};

// generic template without additional logic
export const genericTemplate = (apiObj, templateName) =>
  renderYaml(templateName.replace(/\.eta$/, ''), apiObj);
