import { useCallback, useEffect, useState } from "react";
import api from "./api";
import { useToast } from "./toast";

/**
 * Generic list+CRUD helper for one API resource. Keeps every list page's
 * data-fetching, pagination and success/error toasting identical, so each
 * page only has to describe its columns and its form fields.
 */
export default function useCrud(basePath, { params = {} } = {}) {
  const { notifySuccess, notifyError } = useToast();
  const [data, setData] = useState({ items: [], total: 0, page: 1, total_pages: 0 });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get(basePath, { params: { page, ...params } });
      setData(res.data);
    } catch (err) {
      notifyError(err, "Could not load data");
    } finally {
      setLoading(false);
    }
  }, [basePath, page, JSON.stringify(params)]);

  useEffect(() => { load(); }, [load]);

  async function create(payload, successMessage = "Created successfully") {
    try {
      const res = await api.post(basePath, payload);
      notifySuccess(successMessage);
      await load();
      return res.data || true;
    } catch (err) {
      notifyError(err, "Could not create record");
      return false;
    }
  }

  async function update(id, payload, successMessage = "Updated successfully") {
    try {
      await api.put(`${basePath}/${id}`, payload);
      notifySuccess(successMessage);
      await load();
      return true;
    } catch (err) {
      notifyError(err, "Could not update record");
      return false;
    }
  }

  async function remove(id, successMessage = "Deleted successfully") {
    try {
      await api.delete(`${basePath}/${id}`);
      notifySuccess(successMessage);
      await load();
      return true;
    } catch (err) {
      notifyError(err, "Could not delete record");
      return false;
    }
  }

  async function action(method, path, payload, successMessage = "Done") {
    try {
      await api({ method, url: path, data: payload });
      notifySuccess(successMessage);
      await load();
      return true;
    } catch (err) {
      notifyError(err, "Action failed");
      return false;
    }
  }

  return { data, page, setPage, loading, load, create, update, remove, action };
}
