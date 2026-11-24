import test from 'ava';
import {
  clusterTemplate,
  clusterAuthSecretTemplate,
  clusterSecretTemplate,
  genericTemplate
} from './cluster-template.js';
import {
  applyCluster,
  applyPdbCluster,
  applySecretCluster
} from './cluster-ops.js';
import {
  createCollection,
  updateCollection,
  deleteCollection,
  applyJobs
} from './collection-ops.js';
import { scheduleApplying } from './index.js';
import { LeaseLeaderElection } from './leader-election.js';
import {
  clusterMinimalPayload,
  clusterCompletePayload,
  expectedMinimalTemplate,
  expectedCompleteTemplate,
  expectedCompleteSecretTemplate,
  expectedCompleteServiceTemplate
} from './fixtures.js';

test('Minimal cluster template', (t) => {
  t.deepEqual(clusterTemplate(clusterMinimalPayload), expectedMinimalTemplate);
});

test('Complete cluster template', (t) => {
  t.deepEqual(
    clusterTemplate(clusterCompletePayload),
    expectedCompleteTemplate
  );
});

test('Complete cluster apikey secret template', (t) => {
  t.deepEqual(
    clusterSecretTemplate(
      clusterCompletePayload,
      clusterCompletePayload.spec.apikey
    ),
    expectedCompleteSecretTemplate
  );
});

test('Complete cluster headless service template', (t) => {
  t.deepEqual(
    genericTemplate(clusterCompletePayload, 'service-headless.eta'),
    expectedCompleteServiceTemplate
  );
});

test('clusterTemplate supports HTTPS probes, securityContext, pod options, and jwtRbac', (t) => {
  const payload = {
    ...clusterMinimalPayload,
    spec: {
      ...clusterMinimalPayload.spec,
      apikey: 'my-secret-key',
      jwtRbac: true,
      tls: { enabled: true, secretName: 'my-tls' },
      probes: {
        readiness: { enabled: true, timeoutSeconds: 3 },
        liveness: { enabled: true },
        startup: { enabled: true, failureThreshold: 40 }
      },
      podSecurityContext: { fsGroup: 3000 },
      securityContext: { runAsNonRoot: true, readOnlyRootFilesystem: true },
      nodeSelector: { workload: 'qdrant' },
      serviceAccountName: 'qdrant-sa',
      imagePullSecrets: [{ name: 'regcred' }],
      env: [{ name: 'QDRANT__LOG_LEVEL', value: 'DEBUG' }],
      envFrom: [{ secretRef: { name: 's3-native-creds' } }],
      podAnnotations: { 'prometheus.io/scrape': 'true' },
      podLabels: { team: 'search', clustername: 'should-not-override' },
      persistence: { size: '10Gi', accessModes: ['ReadWriteOncePod'] }
    }
  };
  const sts = clusterTemplate(payload);
  const c = sts.spec.template.spec.containers[0];
  t.is(c.readinessProbe.httpGet.scheme, 'HTTPS');
  t.is(c.readinessProbe.timeoutSeconds, 3);
  t.is(c.livenessProbe.httpGet.path, '/livez');
  t.is(c.livenessProbe.httpGet.scheme, 'HTTPS');
  t.is(c.startupProbe.failureThreshold, 40);
  t.deepEqual(c.securityContext, {
    runAsNonRoot: true,
    readOnlyRootFilesystem: true
  });
  t.deepEqual(sts.spec.template.spec.securityContext, { fsGroup: 3000 });
  t.deepEqual(sts.spec.template.spec.nodeSelector, { workload: 'qdrant' });
  t.is(sts.spec.template.spec.serviceAccountName, 'qdrant-sa');
  t.deepEqual(sts.spec.template.spec.imagePullSecrets, [{ name: 'regcred' }]);
  t.deepEqual(c.envFrom, [{ secretRef: { name: 's3-native-creds' } }]);
  t.true(c.env.some((e) => e.name === 'QDRANT__LOG_LEVEL'));
  t.deepEqual(sts.spec.template.metadata.annotations, {
    'prometheus.io/scrape': 'true'
  });
  t.is(sts.spec.template.metadata.labels.team, 'search');
  t.is(sts.spec.template.metadata.labels.clustername, 'my-cluster');
  t.deepEqual(sts.spec.volumeClaimTemplates[0].spec.accessModes, [
    'ReadWriteOncePod'
  ]);

  const authSecret = clusterAuthSecretTemplate(payload, 'rw-key', 'ro-key');
  const decoded = Buffer.from(authSecret.data['local.yaml'], 'base64').toString(
    'utf8'
  );
  t.true(decoded.includes('api_key: rw-key'));
  t.true(decoded.includes('read_only_api_key: ro-key'));
  t.true(decoded.includes('jwt_rbac: true'));
});

test('applyCluster replaces StatefulSet preserving immutable fields, removes deleted fields, and propagates non-404', async (t) => {
  let replacedBody = null;
  let created = false;
  const existingImmutable = {
    metadata: { resourceVersion: '777' },
    spec: {
      replicas: 1,
      selector: { matchLabels: { app: 'qdrant', clustername: 'my-cluster' } },
      serviceName: 'my-cluster-headless',
      volumeClaimTemplates: [{ metadata: { name: 'qdrant-storage' } }],
      template: {
        spec: {
          containers: [{ name: 'qdrant' }, { name: 'old-sidecar' }]
        }
      }
    }
  };
  const mockAppsApi = {
    readNamespacedStatefulSet: async () => existingImmutable,
    replaceNamespacedStatefulSet: async ({ body }) => {
      replacedBody = body;
    },
    createNamespacedStatefulSet: async () => {
      created = true;
    }
  };
  await applyCluster(clusterMinimalPayload, mockAppsApi, {});
  t.false(created);
  t.is(replacedBody.metadata.resourceVersion, '777');
  t.deepEqual(replacedBody.spec.selector, existingImmutable.spec.selector);
  t.is(replacedBody.spec.serviceName, 'my-cluster-headless');
  t.deepEqual(
    replacedBody.spec.volumeClaimTemplates,
    existingImmutable.spec.volumeClaimTemplates
  );
  // Old sidecar container is gone because replace sends full desired spec
  t.deepEqual(
    replacedBody.spec.template.spec.containers.map((c) => c.name),
    ['qdrant']
  );

  const mockForbiddenAppsApi = {
    readNamespacedStatefulSet: async () => {
      throw { code: 403 };
    },
    createNamespacedStatefulSet: async () => {
      created = true;
    }
  };
  await t.throwsAsync(
    () => applyCluster(clusterMinimalPayload, mockForbiddenAppsApi, {}),
    { any: true }
  );
  t.false(created);
});

test('applySecretCluster propagates non-404 read errors instead of returning undefined', async (t) => {
  const mockCoreApi = {
    readNamespacedSecret: async () => {
      throw Object.assign(new Error('apiserver unavailable'), { code: 500 });
    }
  };
  await t.throwsAsync(
    () => applySecretCluster(clusterCompletePayload, mockCoreApi),
    { message: 'apiserver unavailable' }
  );
});

test('applyPdbCluster deletes PDB when replicas <= 1', async (t) => {
  let deleted = null;
  const mockPolicyApi = {
    deleteNamespacedPodDisruptionBudget: async (params) => {
      deleted = params;
    }
  };
  await applyPdbCluster(clusterMinimalPayload, mockPolicyApi);
  t.deepEqual(deleted, { name: 'my-cluster', namespace: 'default' });
});

test('createCollection supports distance, datatype, sparseVectors, payloadIndexes, and updates status', async (t) => {
  const requests = [];
  let updatedStatus = null;
  const mockCustomApi = {
    getNamespacedCustomObjectStatus: async ({ plural }) =>
      plural === 'qdrantclusters'
        ? { spec: { tls: { enabled: false }, apikey: 'false', replicas: 1 } }
        : { metadata: { resourceVersion: '99' } },
    replaceNamespacedCustomObjectStatus: async ({ body }) => {
      updatedStatus = body.status;
    }
  };
  await createCollection(
    {
      apiVersion: 'qdrant.operator/v1alpha1',
      kind: 'QdrantCollection',
      metadata: { name: 'hybrid-col', namespace: 'default', generation: 2 },
      spec: {
        cluster: 'my-cluster',
        vectorSize: 384,
        distance: 'Dot',
        datatype: 'turbo8',
        onDisk: true,
        shardNumber: 2,
        replicationFactor: 1,
        sparseVectors: { bm25: { modifier: 'idf' } },
        payloadIndexes: [
          { fieldName: 'category', fieldSchema: 'keyword' },
          {
            fieldName: 'offers[].description',
            fieldSchema: { type: 'text', tokenizer: 'word' }
          }
        ]
      }
    },
    mockCustomApi,
    {},
    async (url, opts) => {
      requests.push({ url, method: opts.method, body: JSON.parse(opts.body) });
      return { ok: true, status: 200, data: { status: 'ok', time: 0.01 } };
    }
  );
  t.is(requests.length, 3);
  t.deepEqual(requests[0].body, {
    shard_number: 2,
    replication_factor: 1,
    vectors: { size: 384, distance: 'Dot', on_disk: true, datatype: 'turbo8' },
    sparse_vectors: { bm25: { modifier: 'idf' } }
  });
  t.is(
    requests[1].url,
    'http://my-cluster.default.svc.cluster.local:6333/collections/hybrid-col/index?wait=true'
  );
  t.deepEqual(requests[1].body, {
    field_name: 'category',
    field_schema: 'keyword'
  });
  t.deepEqual(requests[2].body, {
    field_name: 'offers[].description',
    field_schema: { type: 'text', tokenizer: 'word' }
  });
  t.deepEqual(updatedStatus, {
    collectionStatus: 'Ready',
    message: 'ok',
    observedGeneration: 2
  });
});

test('createCollection supports named vectors without vectorSize', async (t) => {
  let body = null;
  const mockCustomApi = {
    getNamespacedCustomObjectStatus: async () => ({
      spec: { tls: { enabled: false }, apikey: 'false', replicas: 1 }
    })
  };
  await createCollection(
    {
      apiVersion: 'qdrant.operator/v1alpha1',
      kind: 'QdrantCollection',
      metadata: { name: 'named-col', namespace: 'default' },
      spec: {
        cluster: 'my-cluster',
        shardNumber: 1,
        replicationFactor: 1,
        vectors: {
          title: { size: 128, distance: 'Cosine' },
          colbert: {
            size: 128,
            distance: 'Cosine',
            multivector_config: { comparator: 'max_sim' }
          }
        }
      }
    },
    mockCustomApi,
    {},
    async (_url, opts) => {
      body = JSON.parse(opts.body);
      return { ok: true, status: 200, data: { status: 'ok', time: 0.01 } };
    }
  );
  t.deepEqual(body.vectors.colbert.multivector_config, {
    comparator: 'max_sim'
  });
  t.is(body.vectors.size, undefined);
});

test('updateCollection sends valid Qdrant PATCH payload with cluster CA', async (t) => {
  const collectionObj = {
    apiVersion: 'qdrant.operator/v1alpha1',
    kind: 'QdrantCollection',
    metadata: {
      name: 'my-col',
      namespace: 'default',
      resourceVersion: '10',
      uid: 'col-uid'
    },
    spec: {
      cluster: 'my-cluster',
      vectorSize: 128,
      onDisk: true,
      shardNumber: 4,
      replicationFactor: 2
    }
  };
  const mockCustomApi = {
    getNamespacedCustomObjectStatus: async () => ({
      spec: { tls: { enabled: true }, apikey: 'false', replicas: 3 }
    })
  };
  const mockCoreApi = {
    readNamespacedSecret: async () => ({
      data: {
        'cacert.pem': Buffer.from('FAKE-CA-PEM').toString('base64')
      }
    })
  };
  let captured = null;
  await updateCollection(
    collectionObj,
    mockCustomApi,
    mockCoreApi,
    async (url, opts) => {
      captured = { url, opts };
      return { ok: true, status: 200, data: { status: 'ok', time: 0.01 } };
    }
  );
  t.is(
    captured.url,
    'https://my-cluster.default.svc.cluster.local:6333/collections/my-col'
  );
  t.is(captured.opts.method, 'PATCH');
  t.is(captured.opts.ca, 'FAKE-CA-PEM');
  t.deepEqual(JSON.parse(captured.opts.body), {
    vectors: { '': { on_disk: true } },
    params: { replication_factor: 2 }
  });
});

test('deleteCollection skips cleanly when parent cluster is 404', async (t) => {
  let called = false;
  const mockCustomApi = {
    getNamespacedCustomObjectStatus: async () => {
      throw { code: 404 };
    }
  };
  await t.notThrowsAsync(() =>
    deleteCollection(
      {
        metadata: { name: 'my-col', namespace: 'default' },
        spec: { cluster: 'gone-cluster' }
      },
      mockCustomApi,
      {},
      async () => {
        called = true;
      }
    )
  );
  t.false(called);
});

test('createCollection switches to updateCollection on HTTP 409 and becomes Ready', async (t) => {
  const requests = [];
  let updatedStatus = null;
  const mockCustomApi = {
    getNamespacedCustomObjectStatus: async ({ plural }) =>
      plural === 'qdrantclusters'
        ? { spec: { tls: { enabled: false }, apikey: 'false', replicas: 1 } }
        : { metadata: { resourceVersion: '101' }, status: {} },
    replaceNamespacedCustomObjectStatus: async ({ body }) => {
      updatedStatus = body.status;
    }
  };
  await createCollection(
    {
      apiVersion: 'qdrant.operator/v1alpha1',
      kind: 'QdrantCollection',
      metadata: { name: 'existing-col', namespace: 'default', generation: 3 },
      spec: {
        cluster: 'my-cluster',
        vectorSize: 128,
        onDisk: true,
        shardNumber: 1,
        replicationFactor: 2,
        payloadIndexes: [{ fieldName: 'tag', fieldSchema: 'keyword' }]
      }
    },
    mockCustomApi,
    {},
    async (url, opts) => {
      requests.push({ url, method: opts.method });
      if (opts.method === 'PUT' && url.endsWith('/collections/existing-col')) {
        return {
          ok: false,
          status: 409,
          data: { status: { error: 'Collection already exists' } }
        };
      }
      return { ok: true, status: 200, data: { status: 'ok', time: 0.01 } };
    }
  );
  t.deepEqual(
    requests.map((r) => `${r.method} ${r.url.split('/collections/')[1]}`),
    [
      'PUT existing-col',
      'PATCH existing-col',
      'PUT existing-col/index?wait=true'
    ]
  );
  t.deepEqual(updatedStatus, {
    collectionStatus: 'Ready',
    message: 'ok',
    observedGeneration: 3
  });
});

test('updateCollection merges spec.config.params without overwriting replication_factor', async (t) => {
  let capturedBody = null;
  const mockCustomApi = {
    getNamespacedCustomObjectStatus: async () => ({
      spec: { tls: { enabled: false }, apikey: 'false', replicas: 3 }
    })
  };
  await updateCollection(
    {
      apiVersion: 'qdrant.operator/v1alpha1',
      kind: 'QdrantCollection',
      metadata: { name: 'params-col', namespace: 'default', generation: 2 },
      spec: {
        cluster: 'my-cluster',
        vectorSize: 128,
        onDisk: true,
        replicationFactor: 2,
        config: {
          params: { write_consistency_factor: 2 }
        }
      }
    },
    mockCustomApi,
    {},
    async (_url, opts) => {
      capturedBody = JSON.parse(opts.body);
      return { ok: true, status: 200, data: { status: 'ok', time: 0.01 } };
    }
  );
  t.deepEqual(capturedBody.params, {
    replication_factor: 2,
    write_consistency_factor: 2
  });
});

test('applyJobs mounts CA cert when TLS enabled, sets ownerReferences, deletes empty CronJob, and skips duplicate backup/restore', async (t) => {
  const prevJobImage = process.env.JOB_IMAGE;
  process.env.JOB_IMAGE = 'qdrant-operator:test';
  t.teardown(() => {
    if (prevJobImage === undefined) {
      delete process.env.JOB_IMAGE;
    } else {
      process.env.JOB_IMAGE = prevJobImage;
    }
  });

  let deletedCron = null;
  const createdJobs = [];
  let savedStatus = {};
  const mockCustomApi = {
    getNamespacedCustomObjectStatus: async ({ plural }) =>
      plural === 'qdrantclusters'
        ? { spec: { tls: { enabled: true }, apikey: 'false', replicas: 1 } }
        : { metadata: { resourceVersion: '42' }, status: savedStatus },
    replaceNamespacedCustomObjectStatus: async ({ body }) => {
      savedStatus = body.status;
    }
  };
  const mockBatchApi = {
    createNamespacedJob: async ({ body }) => {
      createdJobs.push(body);
    },
    deleteNamespacedCronJob: async (params) => {
      deletedCron = params;
    }
  };
  const colObj = {
    apiVersion: 'qdrant.operator/v1alpha1',
    kind: 'QdrantCollection',
    metadata: {
      name: 'my-col',
      namespace: 'default',
      generation: 5,
      resourceVersion: '42',
      uid: 'col-uid'
    },
    spec: {
      cluster: 'my-cluster',
      snapshots: {
        backupNow: true,
        backupSchedule: '',
        restoreSnapshotName: 'snap-1.snapshot',
        s3EndpointURL: 'https://s3.amazonaws.com',
        s3CredentialsSecretName: 's3-creds',
        bucketName: 'my-bucket'
      }
    }
  };

  await applyJobs(colObj, mockCustomApi, mockBatchApi);
  t.deepEqual(deletedCron, { name: 'my-col-backup', namespace: 'default' });
  t.is(createdJobs.length, 2);
  t.is(createdJobs[0].metadata.ownerReferences[0].uid, 'col-uid');
  const podSpec = createdJobs[0].spec.template.spec;
  t.true(
    podSpec.containers[0].env.some(
      (e) =>
        e.name === 'CA_CERT_PATH' && e.value === '/etc/qdrant-tls/cacert.pem'
    )
  );
  t.is(podSpec.volumes[0].secret.secretName, 'my-cluster-server-cert');
  t.is(savedStatus.lastBackupGeneration, 5);
  t.is(savedStatus.lastRestoredSnapshot, 'snap-1.snapshot');

  // Re-running with recorded status must not spawn duplicate Jobs
  await applyJobs(
    { ...colObj, status: savedStatus },
    mockCustomApi,
    mockBatchApi
  );
  t.is(createdJobs.length, 2);
});

test('scheduleApplying reconciles multiple clusters concurrently without dropping events', async (t) => {
  const applied = [];
  const c1 = { metadata: { name: 'cluster-a', namespace: 'default' } };
  const c2 = { metadata: { name: 'cluster-b', namespace: 'default' } };
  scheduleApplying(c1, (obj) => applied.push(obj.metadata.name));
  scheduleApplying(c2, (obj) => applied.push(obj.metadata.name));
  await new Promise((resolve) => setTimeout(resolve, 1150));
  t.deepEqual(applied.sort(), ['cluster-a', 'cluster-b']);
});

test('LeaseLeaderElection creates lease on 404 and respects active holder', async (t) => {
  let storedLease = null;
  const mockApi = {
    readNamespacedLease: async () => {
      if (!storedLease) {
        throw { code: 404 };
      }
      return storedLease;
    },
    createNamespacedLease: async ({ body }) => {
      storedLease = body;
      return body;
    },
    replaceNamespacedLease: async ({ body }) => {
      storedLease = body;
      return body;
    }
  };

  const pod1 = new LeaseLeaderElection(mockApi, {
    leaseName: 'qdrant-operator',
    namespace: 'qdrant-operator',
    identity: 'pod-1',
    leaseDurationSeconds: 15
  });
  const pod2 = new LeaseLeaderElection(mockApi, {
    leaseName: 'qdrant-operator',
    namespace: 'qdrant-operator',
    identity: 'pod-2',
    leaseDurationSeconds: 15
  });

  t.true(await pod1.tryAcquireOrRenew());
  t.is(storedLease.spec.holderIdentity, 'pod-1');
  t.false(await pod2.tryAcquireOrRenew());
  t.true(await pod1.tryAcquireOrRenew());
});

test('LeaseLeaderElection triggers onLeadershipLost when renewal errors outlast leaseDurationSeconds', async (t) => {
  let lost = false;
  const failingApi = {
    readNamespacedLease: async () => {
      throw new Error('apiserver unreachable');
    }
  };
  const election = new LeaseLeaderElection(failingApi, {
    leaseName: 'qdrant-operator',
    namespace: 'qdrant-operator',
    identity: 'pod-1',
    leaseDurationSeconds: 10,
    onLeadershipLost: () => {
      lost = true;
    }
  });
  election.running = true;
  election.lastRenewedAt = Date.now() - 11_000;
  await election.renewOnce();
  t.true(lost);
  t.false(election.running);
});

test('LeaseLeaderElection skips overlapping renewOnce while renewInFlight is true', async (t) => {
  let calls = 0;
  let release;
  const slowApi = {
    readNamespacedLease: () =>
      new Promise((resolve) => {
        calls += 1;
        release = () =>
          resolve({
            metadata: { name: 'qdrant-operator' },
            spec: {
              holderIdentity: 'pod-1',
              renewTime: new Date().toISOString()
            }
          });
      }),
    replaceNamespacedLease: async ({ body }) => body
  };
  const election = new LeaseLeaderElection(slowApi, {
    leaseName: 'qdrant-operator',
    namespace: 'qdrant-operator',
    identity: 'pod-1',
    leaseDurationSeconds: 15
  });
  election.running = true;
  election.lastRenewedAt = Date.now();

  const first = election.renewOnce();
  await election.renewOnce(); // must be skipped while first is in flight
  t.is(calls, 1);
  release();
  await first;
  t.false(election.renewInFlight);
});

test('applyJobs renders valid CronJob and preserves numeric bucketName as string', async (t) => {
  const prevJobImage = process.env.JOB_IMAGE;
  process.env.JOB_IMAGE = 'qdrant-operator:test';
  t.teardown(() => {
    if (prevJobImage === undefined) {
      delete process.env.JOB_IMAGE;
    } else {
      process.env.JOB_IMAGE = prevJobImage;
    }
  });

  let createdCron = null;
  const mockCustomApi = {
    getNamespacedCustomObjectStatus: async () => ({
      spec: { tls: { enabled: false }, apikey: 'false', replicas: 3 }
    })
  };
  const mockBatchApi = {
    readNamespacedCronJob: async () => {
      throw { code: 404 };
    },
    createNamespacedCronJob: async ({ body }) => {
      createdCron = body;
    }
  };

  await applyJobs(
    {
      apiVersion: 'qdrant.operator/v1alpha1',
      kind: 'QdrantCollection',
      metadata: {
        name: 'sched-col',
        namespace: 'default',
        generation: 1,
        uid: 'sched-uid'
      },
      spec: {
        cluster: 'my-cluster',
        snapshots: {
          backupNow: false,
          backupSchedule: '0 2 * * *',
          restoreSnapshotName: '',
          s3EndpointURL: 'https://s3.amazonaws.com',
          s3CredentialsSecretName: 's3-creds',
          bucketName: '12345'
        }
      }
    },
    mockCustomApi,
    mockBatchApi
  );

  t.is(createdCron.kind, 'CronJob');
  t.is(createdCron.spec.schedule, '0 2 * * *');
  const env = createdCron.spec.jobTemplate.spec.template.spec.containers[0].env;
  const bucketEnv = env.find((e) => e.name === 'BUCKET_NAME');
  t.is(bucketEnv.value, '12345');
  t.is(typeof bucketEnv.value, 'string');
});

test('createCollection returns permanent on HTTP 400 and retry on HTTP 503', async (t) => {
  const mockCustomApi = {
    getNamespacedCustomObjectStatus: async ({ plural }) =>
      plural === 'qdrantclusters'
        ? { spec: { tls: { enabled: false }, apikey: 'false', replicas: 1 } }
        : { metadata: { resourceVersion: '1' }, status: {} },
    replaceNamespacedCustomObjectStatus: async () => {}
  };
  const col = {
    apiVersion: 'qdrant.operator/v1alpha1',
    kind: 'QdrantCollection',
    metadata: { name: 'err-col', namespace: 'default', generation: 1 },
    spec: { cluster: 'my-cluster', vectorSize: 128 }
  };

  const res400 = await createCollection(col, mockCustomApi, {}, async () => ({
    ok: false,
    status: 400,
    data: { status: { error: 'bad vector size' } }
  }));
  t.is(res400, 'permanent');

  const res503 = await createCollection(col, mockCustomApi, {}, async () => ({
    ok: false,
    status: 503,
    data: { status: { error: 'temporarily unavailable' } }
  }));
  t.is(res503, 'retry');
});
