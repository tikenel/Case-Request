/// <reference types="vite/client" />
interface ImportMetaEnv {
  readonly VITE_SMART_CLIENT_ID?: string;
  readonly VITE_SMART_SCOPES?: string;
  readonly VITE_WRITE_NOTE?: string;
  readonly VITE_WRITE_ORDERS?: string;
  readonly VITE_NOTE_TYPE_SYSTEM?: string;
  readonly VITE_NOTE_TYPE_CODE?: string;
  readonly VITE_NOTE_TYPE_DISPLAY?: string;
}
