import { Message } from './message.js';

// Define ExecutionMeta interface
export interface ExecutionMeta {
  current_node: string;
  step: number;
  /** Server execution status, e.g. 'running', 'interrupted_before', 'completed'. */
  status?: string;
  interrupted_node?: string | null;
  interrupt_reason?: string | null;
  interrupt_data?: Record<string, any> | null;
  thread_id?: string | null;
  run_id?: string | null;
  stop_current_execution?: string;
  internal_data?: Record<string, any>;
  /** @deprecated The server never sends this field. Read `status` / `interrupted_node`. */
  interrupt?: {
    node: string;
    reason: string;
    status: string;
    data?: Record<string, any>;
  };
  /** @deprecated The server never sends this field. Read `status`. */
  is_running?: boolean;
  /** @deprecated The server never sends this field. Read `status`. */
  is_interrupted?: boolean;
  /** @deprecated The server never sends this field. Read `stop_current_execution`. */
  is_stopped_requested?: boolean;
}

// Define default ExecutionMeta implementation
class DefaultExecutionMeta implements ExecutionMeta {
  current_node: string = 'START';
  step: number = 0;
  is_running: boolean = true;
  is_interrupted: boolean = false;
  is_stopped_requested: boolean = false;

  interrupt?: {
    node: string;
    reason: string;
    status: string;
    data?: Record<string, any>;
  };
}

// Define AgentState class
export class AgentState {
  context: Message[] = [];
  context_summary: string | null = null;
  execution_meta: ExecutionMeta = new DefaultExecutionMeta();

  constructor(initialData: Partial<Record<string, any>> = {}) {
    Object.assign(this, initialData);
  }
}
