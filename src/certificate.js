import forge from 'node-forge';

const createRootCA = async () => {
  const { privateKey, publicKey } = await forge.pki.rsa.generateKeyPair(2048);

  const attributes = [
    {
      shortName: 'C',
      value: 'US'
    },
    {
      shortName: 'ST',
      value: 'CA'
    },
    {
      shortName: 'OU',
      value: 'QdrantOperator'
    },
    {
      shortName: 'CN',
      value: 'MyCA'
    }
  ];

  const extensions = [
    {
      name: 'basicConstraints',
      cA: true
    },
    {
      name: 'keyUsage',
      keyCertSign: true,
      cRLSign: true
    }
  ];

  const cert = await forge.pki.createCertificate();

  cert.publicKey = publicKey;
  cert.serialNumber = '01';
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date();
  cert.validity.notAfter.setFullYear(
    cert.validity.notBefore.getFullYear() + 10
  );
  cert.setSubject(attributes);
  cert.setIssuer(attributes);
  cert.setExtensions(extensions);

  cert.sign(privateKey, forge.md.sha512.create());
  const pemCert = forge.pki.certificateToPem(cert);
  const pemKey = forge.pki.privateKeyToPem(privateKey);

  return {
    certificate: pemCert,
    privateKey: pemKey,
    notBefore: cert.validity.notBefore,
    notAfter: cert.validity.notAfter
  };
};

const createServerCert = async (commonName, validDomains, rootCA) => {
  let caCert = forge.pki.certificateFromPem(rootCA.certificate);
  let caKey = forge.pki.privateKeyFromPem(rootCA.privateKey);

  const serverKeys = await forge.pki.rsa.generateKeyPair(2048);
  const attributes = [
    {
      shortName: 'C',
      value: 'US'
    },
    {
      shortName: 'ST',
      value: 'CA'
    },
    {
      shortName: 'OU',
      value: 'QdrantOperator'
    },
    {
      shortName: 'CN',
      value: commonName
    }
  ];

  const extensions = [
    {
      name: 'basicConstraints',
      cA: true
    },
    {
      name: 'nsCertType',
      server: true
    },
    {
      name: 'subjectKeyIdentifier'
    },
    {
      name: 'authorityKeyIdentifier',
      authorityCertIssuer: true,
      serialNumber: caCert.serialNumber
    },
    {
      name: 'keyUsage',
      digitalSignature: true,
      nonRepudiation: true,
      keyEncipherment: true
    },
    {
      name: 'extKeyUsage',
      serverAuth: true
    },
    {
      name: 'subjectAltName',
      altNames: validDomains.map((domain) => {
        return { type: 2, value: domain };
      })
    }
  ];

  let newServerCert = await forge.pki.createCertificate();

  newServerCert.publicKey = serverKeys.publicKey;
  newServerCert.serialNumber = '01';
  newServerCert.validity.notBefore = rootCA.notBefore;
  newServerCert.validity.notAfter = rootCA.notAfter;
  newServerCert.setSubject(attributes);
  newServerCert.setIssuer(caCert.subject.attributes);
  newServerCert.setExtensions(extensions);

  newServerCert.sign(caKey, forge.md.sha512.create());

  let pemServerCert = forge.pki.certificateToPem(newServerCert);
  let pemServerKey = forge.pki.privateKeyToPem(serverKeys.privateKey);

  return {
    certificate: pemServerCert,
    privateKey: pemServerKey,
    notAfter: newServerCert.validity.notBefore,
    notAfter: newServerCert.validity.notAfter
  };
};

export const generateCert = async (apiObj) => {
  const name = apiObj.metadata.name;
  const namespace = apiObj.metadata.namespace;
  const clusterDomain = process.env.CLUSTER_DOMAIN || 'cluster.local';

  const CA = await createRootCA();
  const serverCert = await createServerCert(
    apiObj.metadata.name,
    [
      name,
      name + '-headless',
      name + '.' + namespace,
      name + '-headless.' + namespace,
      '*.' + namespace + '.svc.' + clusterDomain
    ],
    CA
  );
  return {
    'cert.pem': serverCert.certificate,
    'key.pem': serverCert.privateKey,
    'cacert.pem': CA.certificate
  };
};
