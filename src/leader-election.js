import { V1MicroTime } from '@kubernetes/client-node';
import { log } from './logger.js';
import { isConflict, isNotFound } from './k8s-utils.js';

export class LeaseLeaderElection {
  constructor(
    k8sCoordinationApi,
    {
      leaseName,
      namespace,
      identity,
      leaseDurationSeconds = 15,
      renewIntervalMs = 5000,
      retryIntervalMs = 5000,
      onLeadershipLost = () => {
        log('Leader status lost, restarting...');
        process.exit(1);
      }
    }
  ) {
    this.api = k8sCoordinationApi;
    this.leaseName = leaseName;
    this.namespace = namespace;
    this.identity = identity;
    this.leaseDurationSeconds = leaseDurationSeconds;
    this.renewIntervalMs = renewIntervalMs;
    this.retryIntervalMs = retryIntervalMs;
    this.onLeadershipLost = onLeadershipLost;
    this.running = false;
    this.renewTimer = null;
    this.lastRenewedAt = 0;
    this.renewInFlight = false;
  }

  async tryAcquireOrRenew() {
    const now = new V1MicroTime();
    let lease;

    try {
      lease = await this.api.readNamespacedLease({
        name: this.leaseName,
        namespace: this.namespace
      });
    } catch (err) {
      if (!isNotFound(err)) {
        throw err;
      }
      try {
        await this.api.createNamespacedLease({
          namespace: this.namespace,
          body: {
            metadata: { name: this.leaseName, namespace: this.namespace },
            spec: {
              holderIdentity: this.identity,
              leaseDurationSeconds: this.leaseDurationSeconds,
              acquireTime: now,
              renewTime: now,
              leaseTransitions: 0
            }
          }
        });
        return true;
      } catch (createErr) {
        if (isConflict(createErr)) {
          return false;
        }
        throw createErr;
      }
    }

    const spec = lease.spec || {};
    const renewMs = spec.renewTime ? new Date(spec.renewTime).getTime() : 0;
    const durationMs =
      (spec.leaseDurationSeconds || this.leaseDurationSeconds) * 1000;
    const isOwner = spec.holderIdentity === this.identity;
    const isExpired = !spec.holderIdentity || renewMs + durationMs < Date.now();

    if (!isOwner && !isExpired) {
      return false;
    }

    try {
      await this.api.replaceNamespacedLease({
        name: this.leaseName,
        namespace: this.namespace,
        body: {
          ...lease,
          spec: {
            ...spec,
            holderIdentity: this.identity,
            leaseDurationSeconds: this.leaseDurationSeconds,
            renewTime: now,
            acquireTime: isOwner ? spec.acquireTime || now : now,
            leaseTransitions: isOwner
              ? spec.leaseTransitions || 0
              : (spec.leaseTransitions || 0) + 1
          }
        }
      });
      return true;
    } catch (err) {
      if (isConflict(err)) {
        return false;
      }
      throw err;
    }
  }

  async start() {
    this.running = true;
    while (this.running) {
      try {
        if (await this.tryAcquireOrRenew()) {
          break;
        }
      } catch (err) {
        log(`Lease acquisition error: ${err}`);
      }
      await new Promise((resolve) => setTimeout(resolve, this.retryIntervalMs));
    }

    if (!this.running) {
      return;
    }

    this.lastRenewedAt = Date.now();
    this.renewTimer = setInterval(async () => {
      await this.renewOnce();
    }, this.renewIntervalMs);
  }

  async renewOnce() {
    if (!this.running) {
      return;
    }
    // Check lease TTL first so a hung in-flight request cannot mask expiration
    if (Date.now() - this.lastRenewedAt >= this.leaseDurationSeconds * 1000) {
      this.stop();
      this.onLeadershipLost();
      return;
    }
    if (this.renewInFlight) {
      return;
    }
    this.renewInFlight = true;
    try {
      const ok = await this.tryAcquireOrRenew();
      if (ok) {
        this.lastRenewedAt = Date.now();
        return;
      }
      this.stop();
      this.onLeadershipLost();
    } catch (err) {
      log(`Lease renewal error: ${err}`);
      // Prevent split-brain if API server is unreachable longer than lease TTL
      if (Date.now() - this.lastRenewedAt >= this.leaseDurationSeconds * 1000) {
        this.stop();
        this.onLeadershipLost();
      }
    } finally {
      this.renewInFlight = false;
    }
  }

  stop() {
    this.running = false;
    if (this.renewTimer) {
      clearInterval(this.renewTimer);
      this.renewTimer = null;
    }
  }
}
