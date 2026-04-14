/**
 * React hooks for related records
 */
import { useState, useEffect } from 'react';
import { fetchRelatedRecord, formatRelatedRecord, getRelatedObjectType } from './relatedRecords';

/**
 * Hook to fetch and display a single related record
 * @param {string} fieldName - The field name (e.g., 'lead_id', 'related_to')
 * @param {string} recordId - The record ID or series_id
 * @param {string} objectType - Optional: explicitly specify the object type
 * @returns {Object} - { display, loading, error }
 */
export const useRelatedRecord = (fieldName, recordId, objectType = null) => {
  const [display, setDisplay] = useState('—');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!recordId) {
      setDisplay('—');
      return;
    }

    const loadRelatedRecord = async () => {
      setLoading(true);
      setError(null);

      try {
        // Determine object type
        const objType = objectType || getRelatedObjectType(fieldName, recordId);
        
        console.log("hello i am unser related" ,objType)
        if (!objType) {
          setDisplay(recordId); // Fallback to showing the ID
          setLoading(false);
          return;
        }

        // Fetch the related record
        const record = await fetchRelatedRecord(objType, recordId);
        if (record) {
          setDisplay(formatRelatedRecord(record));
        } else {
          setDisplay(recordId); // Fallback
        }
      } catch (err) {
        console.error('Error loading related record:', err);
        setError(err);
        setDisplay(recordId); // Fallback on error
      } finally {
        setLoading(false);
      }
    };

    loadRelatedRecord();
  }, [fieldName, recordId, objectType]);

  return { display, loading, error };
};

/**
 * Hook to fetch multiple related records for a list
 * @param {Array} records - Array of records with related fields
 * @param {Array} relatedFieldNames - Field names to resolve (e.g., ['lead_id', 'contact_id'])
 * @returns {Object} - { displayMap, loading }
 */
export const useBatchRelatedRecords = (records, relatedFieldNames) => {
  const [displayMap, setDisplayMap] = useState(new Map());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!records || records.length === 0) {
      setDisplayMap(new Map());
      return;
    }

    const loadBatchRecords = async () => {
      setLoading(true);
      const newDisplayMap = new Map();

      // Collect all related field references
      const relatedRefs = [];
      records.forEach((record, recordIndex) => {
        relatedFieldNames.forEach(fieldName => {
          const fieldValue = record.data?.[fieldName];
          if (fieldValue) {
            const objectType = getRelatedObjectType(fieldName, fieldValue);
            if (objectType) {
              relatedRefs.push({
                recordIndex,
                fieldName,
                objectType,
                recordId: fieldValue
              });
            }
          }
        });
      });

      // Fetch all in parallel
      await Promise.all(
        relatedRefs.map(async ({ recordIndex, fieldName, objectType, recordId }) => {
          const key = `${recordIndex}:${fieldName}`;
          try {
            const relatedRecord = await fetchRelatedRecord(objectType, recordId);
            newDisplayMap.set(key, formatRelatedRecord(relatedRecord));
          } catch (error) {
            console.error(`Error fetching ${objectType}:${recordId}:`, error);
            newDisplayMap.set(key, recordId); // Fallback
          }
        })
      );

      setDisplayMap(newDisplayMap);
      setLoading(false);
    };

    loadBatchRecords();
  }, [records, relatedFieldNames]);

  return { displayMap, loading };
};
