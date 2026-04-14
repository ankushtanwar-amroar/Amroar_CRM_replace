import { useState, useEffect } from 'react';
import recordTypesService from '../services/recordTypesService';

export const useRecordTypes = (objectName) => {
  const [recordTypes, setRecordTypes] = useState([]);
  const [objectFields, setObjectFields] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (objectName) {
      fetchRecordTypes();
      fetchFields();
    }
  }, [objectName]);

  const fetchRecordTypes = async () => {
    try {
      setLoading(true);
      const data = await recordTypesService.getRecordTypes(objectName);
      setRecordTypes(data);
    } catch (error) {
      console.error('Error fetching record types:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchFields = async () => {
    try {
      const data = await recordTypesService.getObjectFields(objectName);
      if (data.fields) {
        const fieldList = Object.keys(data.fields).map(key => ({
          name: key,
          api_name: key,
          key: key,
          label: data.fields[key].label || key,
          type: data.fields[key].type || 'text',
          field_type: data.fields[key].type || 'text',
          required: data.fields[key].required || false,
          options: data.fields[key].options || [],
          picklist_values: data.fields[key].options || []
        }));
        setObjectFields(fieldList);
      }
    } catch (error) {
      console.error('Error fetching fields:', error);
    }
  };

  const createRecordType = async (data) => {
    try {
      await recordTypesService.createRecordType(objectName, data);
      await fetchRecordTypes();
      return true;
    } catch (error) {
      throw error;
    }
  };

  const updateRecordType = async (id, data) => {
    try {
      await recordTypesService.updateRecordType(objectName, id, data);
      await fetchRecordTypes();
      return true;
    } catch (error) {
      throw error;
    }
  };

  const deleteRecordType = async (id) => {
    try {
      await recordTypesService.deleteRecordType(objectName, id);
      await fetchRecordTypes();
      return true;
    } catch (error) {
      throw error;
    }
  };

  return {
    recordTypes,
    objectFields,
    loading,
    createRecordType,
    updateRecordType,
    deleteRecordType,
    refresh: fetchRecordTypes
  };
};

export default useRecordTypes;