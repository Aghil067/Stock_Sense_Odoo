import { MapPin, Pencil, Plus, Trash2, Warehouse as WarehouseIcon, X } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { useAuth } from '../auth-context';
import { EmptyState, LoadingState, PageHeader } from '../components/app-shell';
import { api, ApiClientError } from '../lib/api';
import type { Category, Location, Unit, Warehouse } from '../types';

type MasterData = { categories: Category[]; units: Unit[]; warehouses: Warehouse[] };
type SetupKind = 'warehouse' | 'location' | 'category' | 'unit';

type EditTarget = {
  kind: SetupKind;
  id: string;
  name: string;
  code?: string;
  address?: string;
  symbol?: string;
  warehouseId?: string;
};

type DeleteTarget = {
  kind: SetupKind;
  id: string;
  name: string;
};

const pluralNames: Record<SetupKind, string> = {
  warehouse: 'warehouses',
  location: 'locations',
  category: 'categories',
  unit: 'units',
};

export function SettingsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [activeForm, setActiveForm] = useState<SetupKind | null>(null);
  const [editingRecord, setEditingRecord] = useState<EditTarget | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [error, setError] = useState('');

  const query = useQuery({
    queryKey: ['master-data'],
    queryFn: () => api<MasterData>('/master-data'),
  });

  const save = useMutation({
    mutationFn: async ({
      kind,
      id,
      payload,
    }: {
      kind: SetupKind;
      id?: string;
      payload: Record<string, string>;
    }) => {
      const endpoint = id ? `/master-data/${pluralNames[kind]}/${id}` : `/master-data/${pluralNames[kind]}`;
      const method = id ? 'PATCH' : 'POST';
      return api(endpoint, { method, body: JSON.stringify(payload) });
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['master-data'] }),
        queryClient.invalidateQueries({ queryKey: ['products'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
      ]);
      setError('');
      setActiveForm(null);
      setEditingRecord(null);
    },
    onError: (cause) =>
      setError(cause instanceof ApiClientError ? cause.message : 'Could not save this setup record.'),
  });

  const remove = useMutation({
    mutationFn: async (target: DeleteTarget) => {
      return api(`/master-data/${pluralNames[target.kind]}/${target.id}`, { method: 'DELETE' });
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['master-data'] }),
        queryClient.invalidateQueries({ queryKey: ['products'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
      ]);
      setError('');
      setDeleteTarget(null);
    },
    onError: (cause) =>
      setError(cause instanceof ApiClientError ? cause.message : 'Could not delete this setup record.'),
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const payload = Object.fromEntries(formData.entries()) as Record<string, string>;

    if (editingRecord) {
      save.mutate({ kind: editingRecord.kind, id: editingRecord.id, payload });
    } else if (activeForm) {
      save.mutate({ kind: activeForm, payload });
    }
  }

  if (query.isLoading) return <LoadingState />;
  if (query.isError || !query.data) {
    return (
      <EmptyState
        title="Setup unavailable"
        message="Warehouse and catalog setup could not be loaded."
        action={
          <button type="button" className="button" onClick={() => void query.refetch()}>
            Retry
          </button>
        }
      />
    );
  }

  const { categories, units, warehouses } = query.data;
  const isManager = user?.role === 'MANAGER';

  return (
    <>
      <PageHeader
        eyebrow="Configuration"
        title="Inventory setup"
        description="Define the warehouse network and product classifications used by every stock movement."
      />

      {!isManager && (
        <div className="notice">
          Only inventory managers can change setup records. You can review the current configuration below.
        </div>
      )}

      {error && !activeForm && !editingRecord && !deleteTarget && (
        <div className="notice error" role="alert" style={{ marginBottom: '16px' }}>
          {error}
        </div>
      )}

      <div className="settings-grid">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">Location hierarchy</span>
              <h2>Warehouse network</h2>
            </div>
            {isManager && (
              <button
                type="button"
                className="button compact"
                onClick={() => {
                  setActiveForm('warehouse');
                  setEditingRecord(null);
                  setError('');
                }}
              >
                <Plus size={14} /> Warehouse
              </button>
            )}
          </div>

          {warehouses.length ? (
            <div className="warehouse-list">
              {warehouses.map((warehouse) => (
                <article key={warehouse.id}>
                  <div className="warehouse-title" style={{ justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '11px' }}>
                      <div className="location-icon">
                        <WarehouseIcon size={18} />
                      </div>
                      <div>
                        <strong>{warehouse.name}</strong>
                        <span>
                          {warehouse.code} · {warehouse.address || 'No address'}
                        </span>
                      </div>
                    </div>
                    {isManager && (
                      <div className="operation-actions">
                        <button
                          type="button"
                          className="icon-button"
                          aria-label={`Edit ${warehouse.name}`}
                          title={`Edit ${warehouse.name}`}
                          onClick={() => {
                            setEditingRecord({
                              kind: 'warehouse',
                              id: warehouse.id,
                              name: warehouse.name,
                              code: warehouse.code,
                              address: warehouse.address || '',
                            });
                            setActiveForm(null);
                            setError('');
                          }}
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          type="button"
                          className="icon-button"
                          aria-label={`Delete ${warehouse.name}`}
                          title={`Delete ${warehouse.name}`}
                          onClick={() => {
                            setDeleteTarget({ kind: 'warehouse', id: warehouse.id, name: warehouse.name });
                            setError('');
                          }}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="warehouse-locations">
                    {warehouse.locations.map((location: Location) => (
                      <div key={location.id} style={{ justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                          <MapPin size={14} />
                          <span>{location.name}</span>
                          <small>{location.code}</small>
                        </div>
                        {isManager && (
                          <div style={{ display: 'flex', gap: '4px' }}>
                            <button
                              type="button"
                              className="button-link"
                              aria-label={`Edit ${location.name}`}
                              title={`Edit ${location.name}`}
                              onClick={() => {
                                setEditingRecord({
                                  kind: 'location',
                                  id: location.id,
                                  name: location.name,
                                  code: location.code,
                                  warehouseId: warehouse.id,
                                });
                                setActiveForm(null);
                                setError('');
                              }}
                            >
                              <Pencil size={12} />
                            </button>
                            <button
                              type="button"
                              className="button-link"
                              style={{ color: 'var(--red)' }}
                              aria-label={`Delete ${location.name}`}
                              title={`Delete ${location.name}`}
                              onClick={() => {
                                setDeleteTarget({ kind: 'location', id: location.id, name: location.name });
                                setError('');
                              }}
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <EmptyState title="No warehouses" message="Create a warehouse and at least one stock location to begin." />
          )}

          {isManager && (
            <div className="panel-footer">
              <button
                type="button"
                className="button"
                onClick={() => {
                  setActiveForm('location');
                  setEditingRecord(null);
                  setError('');
                }}
                disabled={!warehouses.length}
              >
                <Plus size={15} /> Add stock location
              </button>
            </div>
          )}
        </section>

        <div className="setup-side">
          <section className="panel">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">Product classification</span>
                <h2>Categories</h2>
              </div>
              {isManager && (
                <button
                  type="button"
                  className="button compact"
                  onClick={() => {
                    setActiveForm('category');
                    setEditingRecord(null);
                    setError('');
                  }}
                >
                  <Plus size={14} /> Add
                </button>
              )}
            </div>

            {categories.length ? (
              <div className="setup-list">
                {categories.map((category) => (
                  <span
                    key={category.id}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                  >
                    {category.name}
                    {isManager && (
                      <>
                        <button
                          type="button"
                          className="button-link"
                          aria-label={`Edit ${category.name}`}
                          onClick={() => {
                            setEditingRecord({
                              kind: 'category',
                              id: category.id,
                              name: category.name,
                            });
                            setActiveForm(null);
                            setError('');
                          }}
                        >
                          <Pencil size={12} />
                        </button>
                        <button
                          type="button"
                          className="button-link"
                          style={{ color: 'var(--red)' }}
                          aria-label={`Delete ${category.name}`}
                          onClick={() => {
                            setDeleteTarget({ kind: 'category', id: category.id, name: category.name });
                            setError('');
                          }}
                        >
                          <Trash2 size={12} />
                        </button>
                      </>
                    )}
                  </span>
                ))}
              </div>
            ) : (
              <EmptyState title="No categories" message="Categories make catalog and dashboard filters useful." />
            )}
          </section>

          <section className="panel">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">Quantity language</span>
                <h2>Units of measure</h2>
              </div>
              {isManager && (
                <button
                  type="button"
                  className="button compact"
                  onClick={() => {
                    setActiveForm('unit');
                    setEditingRecord(null);
                    setError('');
                  }}
                >
                  <Plus size={14} /> Add
                </button>
              )}
            </div>

            {units.length ? (
              <div className="setup-list">
                {units.map((unit) => (
                  <span
                    key={unit.id}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                  >
                    {unit.name} <small>({unit.symbol})</small>
                    {isManager && (
                      <>
                        <button
                          type="button"
                          className="button-link"
                          aria-label={`Edit ${unit.name}`}
                          onClick={() => {
                            setEditingRecord({
                              kind: 'unit',
                              id: unit.id,
                              name: unit.name,
                              symbol: unit.symbol,
                            });
                            setActiveForm(null);
                            setError('');
                          }}
                        >
                          <Pencil size={12} />
                        </button>
                        <button
                          type="button"
                          className="button-link"
                          style={{ color: 'var(--red)' }}
                          aria-label={`Delete ${unit.name}`}
                          onClick={() => {
                            setDeleteTarget({ kind: 'unit', id: unit.id, name: unit.name });
                            setError('');
                          }}
                        >
                          <Trash2 size={12} />
                        </button>
                      </>
                    )}
                  </span>
                ))}
              </div>
            ) : (
              <EmptyState title="No units" message="Create units such as pieces, boxes, or kilograms." />
            )}
          </section>
        </div>
      </div>

      {(activeForm || editingRecord) && (
        <div className="modal-backdrop">
          <section className="modal" role="dialog" aria-modal="true" aria-labelledby="setup-title">
            <div className="modal-header">
              <div>
                <span className="eyebrow">Manager setup</span>
                <h2 id="setup-title">
                  {editingRecord
                    ? `Edit ${editingRecord.kind}: ${editingRecord.name}`
                    : `Add ${activeForm}`}
                </h2>
              </div>
              <button
                type="button"
                className="icon-button"
                aria-label="Close"
                onClick={() => {
                  setActiveForm(null);
                  setEditingRecord(null);
                  setError('');
                }}
              >
                <X size={18} />
              </button>
            </div>

            {error && (
              <div className="notice error" role="alert">
                {error}
              </div>
            )}

            <form className="form-stack" onSubmit={handleSubmit}>
              {(() => {
                const currentKind = editingRecord ? editingRecord.kind : activeForm;
                return (
                  <>
                    <label>
                      Name
                      <input
                        name="name"
                        required
                        minLength={2}
                        maxLength={currentKind === 'unit' ? 60 : currentKind === 'category' ? 80 : 100}
                        defaultValue={editingRecord?.name ?? ''}
                        placeholder={
                          currentKind === 'warehouse'
                            ? 'Main Warehouse'
                            : currentKind === 'location'
                            ? 'Receiving Bay'
                            : currentKind === 'category'
                            ? 'Raw Materials'
                            : 'Pieces'
                        }
                      />
                    </label>

                    {(currentKind === 'warehouse' || currentKind === 'location') && (
                      <label>
                        Code
                        <input
                          name="code"
                          required
                          minLength={currentKind === 'warehouse' ? 2 : 1}
                          maxLength={currentKind === 'warehouse' ? 12 : 20}
                          pattern="[A-Za-z0-9_-]+"
                          defaultValue={editingRecord?.code ?? ''}
                          placeholder={currentKind === 'warehouse' ? 'MAIN' : 'BAY-A'}
                        />
                      </label>
                    )}

                    {currentKind === 'unit' && (
                      <label>
                        Symbol
                        <input
                          name="symbol"
                          required
                          maxLength={12}
                          defaultValue={editingRecord?.symbol ?? ''}
                          placeholder="pcs"
                        />
                      </label>
                    )}

                    {currentKind === 'warehouse' && (
                      <label>
                        Address (optional)
                        <input
                          name="address"
                          maxLength={240}
                          defaultValue={editingRecord?.address ?? ''}
                          placeholder="Street, city"
                        />
                      </label>
                    )}

                    {currentKind === 'location' && !editingRecord && (
                      <label>
                        Warehouse
                        <select name="warehouseId" required defaultValue="">
                          <option value="">Choose warehouse</option>
                          {warehouses.map((wh) => (
                            <option key={wh.id} value={wh.id}>
                              {wh.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                  </>
                );
              })()}

              <div className="modal-actions">
                <button
                  type="button"
                  className="button"
                  onClick={() => {
                    setActiveForm(null);
                    setEditingRecord(null);
                    setError('');
                  }}
                >
                  Cancel
                </button>
                <button type="submit" className="button primary" disabled={save.isPending}>
                  {save.isPending ? 'Saving…' : 'Save'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {deleteTarget && (
        <div className="modal-backdrop">
          <section className="modal" role="dialog" aria-modal="true" aria-labelledby="delete-title">
            <div className="modal-header">
              <div>
                <span className="eyebrow" style={{ color: 'var(--red)' }}>
                  Confirm deletion
                </span>
                <h2 id="delete-title">Delete {deleteTarget.kind}?</h2>
              </div>
              <button
                type="button"
                className="icon-button"
                aria-label="Close"
                onClick={() => {
                  setDeleteTarget(null);
                  setError('');
                }}
              >
                <X size={18} />
              </button>
            </div>

            {error && (
              <div className="notice error" role="alert">
                {error}
              </div>
            )}

            <div className="form-stack">
              <p style={{ margin: 0, fontSize: '14px', lineHeight: 1.5 }}>
                Are you sure you want to delete <strong>{deleteTarget.name}</strong>?
              </p>
              <p style={{ margin: 0, fontSize: '12px', color: 'var(--muted)', lineHeight: 1.5 }}>
                If this record is referenced by existing stock, operations, or history, deletion will be rejected to protect inventory data integrity.
              </p>
            </div>

            <div className="modal-actions" style={{ marginTop: '20px' }}>
              <button
                type="button"
                className="button"
                onClick={() => {
                  setDeleteTarget(null);
                  setError('');
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="button danger"
                disabled={remove.isPending}
                onClick={() => remove.mutate(deleteTarget)}
              >
                {remove.isPending ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}

