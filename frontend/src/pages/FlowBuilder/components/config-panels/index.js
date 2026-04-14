/**
 * Config Panels Index
 * Central export for all node configuration panels
 */

// Trigger, MCP, Connector configs (Database operations)
export { default as TriggerConfigPanel } from './TriggerConfigPanel';
export { default as MCPConfigPanel } from './MCPConfigPanel';

// Decision config (Routing)
export { default as DecisionConfigPanel } from './DecisionConfigPanel';

// Logic configs (Flow control)
export { 
  DelayConfigPanel, 
  LoopConfigPanel, 
  ConditionConfigPanel, 
  WaitConfigPanel, 
  MergeConfigPanel 
} from './LogicConfigPanels';

// Assignment and Function configs
export { 
  AssignmentConfigPanel, 
  FunctionConfigPanel 
} from './AssignmentConfigPanels';

// Webhook config (External API calls)
export { default as WebhookConfigPanel } from './WebhookConfigPanel';

// Screen config (Screen Flow Builder)
export { default as ScreenConfigPanel } from './ScreenConfigPanel';

// Send Email config (Enhanced email node)
export { default as SendEmailConfigPanel } from './SendEmailConfigPanel';

// Send Notification config (In-app notifications)
export { default as SendNotificationConfigPanel } from './SendNotificationConfigPanel';

// Integration configs (Smaller integration nodes)
export {
  AIPromptConfigPanel,
  HTTPRequestConfigPanel,
  SlackConfigPanel,
  TeamsConfigPanel,
  GoogleSheetsConfigPanel,
  DatabaseConfigPanel,
  ConnectorConfigPanel
} from './IntegrationConfigPanels';

