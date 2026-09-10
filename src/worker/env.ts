
export interface Env {

  DB: D1Database

  ASSETS: Fetcher

  FILES?: R2Bucket

  FILES_KV?: KVNamespace

  SYNC_HUB?: DurableObjectNamespace

  CREDENTIAL_VAULT?: DurableObjectNamespace

  APP_NAME?: string
}

export interface DatabaseState {
  ftsEnabled: boolean
}


export interface Variables {
  apiToken?: {id:string;user_id:string;folder_id:string;name:string;can_write:number;expires_at:number;revoked_at:number|null}


  database: DatabaseState
  userId: string

  sessionId: string

  user: {
    id: string
    username: string
    login: string
    name: string
    avatarUrl: string
    role: 'owner' | 'member'
    createdAt: number
    settingsRaw: string
  }
}

export type AppBindings = { Bindings: Env; Variables: Variables }
