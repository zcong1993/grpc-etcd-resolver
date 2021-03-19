# grpc-etcd-resolver

[![NPM version](https://img.shields.io/npm/v/@zcong/grpc-etcd-resolver.svg?style=flat)](https://npmjs.com/package/@zcong/grpc-etcd-resolver) [![NPM downloads](https://img.shields.io/npm/dm/@zcong/grpc-etcd-resolver.svg?style=flat)](https://npmjs.com/package/@zcong/grpc-etcd-resolver)

> etcd resolver for @grpc/grpc-js

## Install

```bash
$ yarn add @zcong/grpc-etcd-resolver
# or npm
$ npm i @zcong/grpc-etcd-resolver --save
```

## Usage

### server

```ts
const serviceName = 'test'

const main = async () => {
  const server = new grpc.Server()
  server.addService(HelloService, helloServer)

  const addr = `0.0.0.0:${process.env.PORT ?? '8080'}`

  const etcd = new Etcd3()

  // register service addr to etcd
  register(etcd, serviceName, addr)

  server.bindAsync(addr, grpc.ServerCredentials.createInsecure(), () => {
    server.start()
  })
}
```

### client

```ts
const serviceName = 'test'

const main = async () => {
  const etcd = new Etcd3()
  // setup etcd resolver
  setupEtcdResolver(etcd)

  const c = new HelloClient(
    `${EtcdScheme}:///${serviceName}`, // use service name with EtcdScheme
    grpc.credentials.createInsecure(),
    { 'grpc.service_config': '{"loadBalancingConfig": [{"round_robin": {}}]}' } // use round_robin lb
  )
}
```

## License

MIT &copy; zcong1993
