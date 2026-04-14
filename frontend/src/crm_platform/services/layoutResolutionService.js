/**
 * Layout Resolution Service - CENTRALIZED layout resolution logic
 * 
 * This service handles the STANDARD resolution flow for both Create and Detail pages:
 * 1. Resolve page via pageAssignmentService (object + layoutType + recordTypeId)
 * 2. Fetch layout by page_id
 * 3. Fallback to default object layout if no assignment exists
 * 
 * NO duplicate resolution logic should exist in components.
 * All layout resolution MUST go through this service.
 */
import pageAssignmentService from '../../modules/page-assignments/services/pageAssignmentService';
import lightningLayoutService from '../lightning_builder/services/lightningLayoutService';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

/**
 * Resolve layout for a given context
 * 
 * @param {string} objectName - Object API name (e.g., 'lead', 'account')
 * @param {string} layoutType - 'new' or 'detail'
 * @param {string|null} recordTypeId - Optional record type ID for overrides
 * @param {string} token - Auth token
 * @returns {Promise<{layout: object|null, source: string, pageId: string|null}>}
 */
export async function resolveLayoutForContext(objectName, layoutType, recordTypeId = null, token) {
  console.log(`[LayoutResolution] Resolving layout for ${objectName}/${layoutType} (recordTypeId: ${recordTypeId || 'none'})`);
  
  try {
    // Step 1: Resolve page assignment (checks record type overrides first, then global default)
    const pageAssignment = await pageAssignmentService.resolvePageForContext(
      objectName,
      layoutType,
      recordTypeId
    );
    
    console.log(`[LayoutResolution] Page assignment result:`, pageAssignment);
    
    // Step 2: If we have a page_id, fetch that specific layout
    if (pageAssignment?.page_id) {
      console.log(`[LayoutResolution] Fetching assigned layout: ${pageAssignment.page_id}`);
      
      const layoutResponse = await lightningLayoutService.getLayoutById(
        objectName,
        pageAssignment.page_id,
        token
      );
      
      if (layoutResponse?.layout) {
        console.log(`[LayoutResolution] ✅ Found assigned layout: ${layoutResponse.layout.layout_name}`);
        return {
          layout: layoutResponse.layout,
          source: pageAssignment.resolution_source,
          pageId: pageAssignment.page_id
        };
      }
    }
    
    // Step 3: Fallback to default layout resolution (system/template defaults)
    console.log(`[LayoutResolution] No page assignment, falling back to default resolution`);
    const defaultResult = await lightningLayoutService.resolveLayout(objectName, layoutType, token);
    
    return {
      layout: defaultResult.layout,
      source: defaultResult.source || 'default',
      pageId: null
    };
    
  } catch (error) {
    console.error(`[LayoutResolution] Error resolving layout:`, error);
    
    // Ultimate fallback - try to get default layout
    try {
      const fallbackResult = await lightningLayoutService.resolveLayout(objectName, layoutType, token);
      return {
        layout: fallbackResult.layout,
        source: 'fallback_after_error',
        pageId: null
      };
    } catch (fallbackError) {
      console.error(`[LayoutResolution] Fallback also failed:`, fallbackError);
      return {
        layout: null,
        source: 'error',
        pageId: null
      };
    }
  }
}

/**
 * Check if layout should be invalidated (for caching purposes)
 * Layout cache keys should include: objectName + layoutType + recordTypeId
 */
export function getLayoutCacheKey(objectName, layoutType, recordTypeId) {
  return `${objectName}:${layoutType}:${recordTypeId || 'default'}`;
}

/**
 * Extract record type ID from record data
 * Works with various field names
 */
export function getRecordTypeIdFromRecord(record) {
  if (!record) return null;
  
  // Check data object first
  const data = record.data || record;
  
  return data.record_type_id || 
         data.recordTypeId || 
         data.record_type ||
         record.record_type_id ||
         null;
}

export default {
  resolveLayoutForContext,
  getLayoutCacheKey,
  getRecordTypeIdFromRecord
};
