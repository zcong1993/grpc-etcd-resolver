import { Etcd3, Watcher } from 'etcd3'
import { ChannelOptions, status } from '@grpc/grpc-js'
import {
  registerResolver,
  Resolver,
  ResolverConstructor,
  ResolverListener,
} from '@grpc/grpc-js/build/src/resolver'
import { SubchannelAddress } from '@grpc/grpc-js/build/src/subchannel'
import {
  GrpcUri,
  splitHostPort,
  uriToString,
} from '@grpc/grpc-js/build/src/uri-parser'
import * as logging from '@grpc/grpc-js/build/src/logging'
import { LogVerbosity } from '@grpc/grpc-js/build/src/constants'

const defaultRefreshFreq = 1000 * 60 * 30 // 30min

const TRACER_NAME = 'etcd_resolver'

const trace = (text: string) => {
  logging.trace(LogVerbosity.DEBUG, TRACER_NAME, text)
}

export const EtcdScheme = 'etcd'

export const setupEtcdResolver = (etcdClient: Etcd3) => {
  registerResolver(EtcdScheme, createEtcdResolver(etcdClient))
}

export const createEtcdResolver = (etcdClient: Etcd3): ResolverConstructor => {
  return class EtcdResolver implements Resolver {
    private watcher: Watcher
    private timer: ReturnType<typeof setInterval>
    private addresses = new Set<string>()
    private processing: boolean = false
    constructor(
      private target: GrpcUri,
      private listener: ResolverListener,
      channelOptions: ChannelOptions
    ) {
      trace('Resolver constructed for target ' + uriToString(target))
      this.updateResolution()
      this.timer = setInterval(
        () => this.updateResolution(),
        defaultRefreshFreq
      )
      this.watch()
    }

    updateResolution() {
      trace(
        'Resolution update requested for target ' + uriToString(this.target)
      )
      this._updateResolution()
    }

    destroy() {
      trace('Resolver destroy target ' + uriToString(this.target))
      if (this.watcher) {
        this.watcher.cancel()
      }

      if (this.timer) {
        clearInterval(this.timer)
      }
    }

    private async watch() {
      trace(
        `Resolver watch target ${uriToString(this.target)}, prefix: ${
          this.target.path + '/'
        }`
      )
      this.watcher = await etcdClient
        .watch()
        .prefix(this.target.path + '/')
        .create()
      this.watcher.on('put', (req) => {
        const address = req.key.toString().replace(this.target.path + '/', '')
        trace(
          `Resolver add new address, target ${uriToString(
            this.target
          )}, address: ${address}`
        )
        this.addresses.add(address)
        this.updateResolutionFromAddress()
      })

      this.watcher.on('delete', (req) => {
        const address = req.key.toString().replace(this.target.path + '/', '')
        trace(
          `Resolver remove address, target ${uriToString(
            this.target
          )}, address: ${address}`
        )
        this.addresses.delete(address)
        this.updateResolutionFromAddress()
      })
    }

    private async _updateResolution() {
      if (this.processing) {
        return
      }
      this.processing = true
      try {
        const keys = await etcdClient
          .getAll()
          .prefix(this.target.path + '/')
          .keys()
        this.addresses = new Set(
          keys.map((k) => k.replace(this.target.path + '/', ''))
        )
        this.updateResolutionFromAddress()
      } catch (err) {
        trace(
          `Resolver get keys error, target ${uriToString(
            this.target
          )}, error: ${err.message}`
        )
        this.listener.onError({
          code: status.INTERNAL,
          details: err.message,
          metadata: null,
        })
      } finally {
        this.processing = false
      }
    }

    private updateResolutionFromAddress() {
      if (this.addresses.size === 0) {
        return
      }

      trace(
        `Resolver update listener, target ${uriToString(
          this.target
        )}, address: ${[...this.addresses]}`
      )

      this.listener.onSuccessfulResolution(
        EtcdResolver.addressToSubchannelAddress(this.addresses),
        null,
        null,
        {}
      )
    }

    static addressToSubchannelAddress(
      address: Set<string>
    ): SubchannelAddress[] {
      const res: SubchannelAddress[] = []
      for (const addr of address) {
        const parsed = splitHostPort(addr)
        res.push({
          host: parsed.host,
          port: parsed.port!,
        })
      }

      return res
    }

    static getDefaultAuthority(target: GrpcUri): string {
      return target.path
    }
  }
}
