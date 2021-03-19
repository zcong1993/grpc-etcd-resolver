import { Etcd3 } from 'etcd3'

export const register = async (
  client: Etcd3,
  serviceName: string,
  address: string,
  ttl: number = 2
) => {
  const l = client.lease(ttl, { autoKeepAlive: true })
  return l.put(`${serviceName}/${address}`).value('')
}
