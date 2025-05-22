import React, { useState, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { databaseAPI } from '../services/api';
import { RiDatabase2Line, RiDownload2Line, RiUpload2Line, RiDeleteBin6Line, RiRefreshLine, RiAlertLine } from 'react-icons/ri';
import { formatDistanceToNow } from 'date-fns';

interface Backup {
  filename: string;
  size: number;
  created: string;
  db_version?: string;
}

const Database: React.FC = () => {
  const [isConfirmingReset, setIsConfirmingReset] = useState(false);
  const [backupToRestore, setBackupToRestore] = useState<string | null>(null);
  const [backupToDelete, setBackupToDelete] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  // Fetch backups
  const { 
    data: backupsData, 
    isLoading,
    refetch: refetchBackups
  } = useQuery({
    queryKey: ['backups'],
    queryFn: async () => {
      const res = await databaseAPI.getBackups();
      return res.data;
    }
  });

  // Create backup mutation
  const createBackupMutation = useMutation({
    mutationFn: databaseAPI.createBackup,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['backups'] });
    }
  });

  // Restore backup mutation
  const restoreBackupMutation = useMutation({
    mutationFn: (filename: string) => databaseAPI.restoreBackup(filename),
    onSuccess: () => {
      setBackupToRestore(null);
      queryClient.invalidateQueries(); // Invalidate all queries as data might have changed
    }
  });

  // Delete backup mutation
  const deleteBackupMutation = useMutation({
    mutationFn: (filename: string) => databaseAPI.deleteBackup(filename),
    onSuccess: () => {
      setBackupToDelete(null);
      queryClient.invalidateQueries({ queryKey: ['backups'] });
    }
  });

  // Reset database mutation
  const resetDatabaseMutation = useMutation({
    mutationFn: databaseAPI.resetDatabase,
    onSuccess: () => {
      setIsConfirmingReset(false);
      queryClient.invalidateQueries(); // Invalidate all queries as data has been reset
    }
  });

  // Upload backup mutation
  const uploadBackupMutation = useMutation({
    mutationFn: (formData: FormData) => databaseAPI.uploadBackup(formData),
    onSuccess: () => {
      setIsUploading(false);
      queryClient.invalidateQueries({ queryKey: ['backups'] });
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    },
    onError: () => {
      setIsUploading(false);
    }
  });

  // Handle file upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.name.endsWith('.db')) {
      alert('Only .db files are allowed');
      return;
    }

    // Create form data
    const formData = new FormData();
    formData.append('backup', file);

    // Upload file
    setIsUploading(true);
    uploadBackupMutation.mutate(formData);
  };

  // Handle download
  const handleDownload = (filename: string) => {
    // Create a link to download the file
    const downloadUrl = databaseAPI.getDownloadUrl(filename);
    window.open(downloadUrl, '_blank');
  };

  // Format file size
  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">Database Management</h1>
        <div className="flex items-center space-x-3">
          <button
            onClick={() => refetchBackups()}
            className="flex items-center space-x-1 rounded-md bg-gray-100 px-3 py-1 text-sm text-gray-600 hover:bg-gray-200"
            disabled={isLoading}
          >
            <RiRefreshLine className={isLoading ? "animate-spin" : ""} />
            <span>Refresh</span>
          </button>
          <button
            onClick={() => createBackupMutation.mutate()}
            className="flex items-center space-x-1 rounded-md bg-blue-500 px-3 py-1 text-sm text-white hover:bg-blue-600"
            disabled={createBackupMutation.isPending}
          >
            <RiDownload2Line />
            <span>{createBackupMutation.isPending ? 'Creating Backup...' : 'Create Backup'}</span>
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center space-x-1 rounded-md bg-green-500 px-3 py-1 text-sm text-white hover:bg-green-600"
            disabled={isUploading}
          >
            <RiUpload2Line />
            <span>{isUploading ? 'Uploading...' : 'Upload Backup'}</span>
          </button>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            accept=".db"
            className="hidden"
          />
          <button
            onClick={() => setIsConfirmingReset(true)}
            className="flex items-center space-x-1 rounded-md bg-red-500 px-3 py-1 text-sm text-white hover:bg-red-600"
            disabled={resetDatabaseMutation.isPending}
          >
            <RiAlertLine />
            <span>Reset Database</span>
          </button>
        </div>
      </div>

      {/* Backup listing */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="px-5 py-4 border-b border-gray-200">
          <h2 className="text-lg font-medium text-gray-700">Available Backups</h2>
        </div>

        {isLoading ? (
          <div className="p-8 flex justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
          </div>
        ) : backupsData?.backups?.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Filename
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Created
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Size
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Version
                  </th>
                  <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {backupsData.backups.map((backup: Backup) => (
                  <tr key={backup.filename}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {backup.filename}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatDistanceToNow(new Date(backup.created), { addSuffix: true })}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatFileSize(backup.size)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {backup.db_version || 'Unknown'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <button
                        onClick={() => handleDownload(backup.filename)}
                        className="text-green-600 hover:text-green-900 mr-4"
                      >
                        Download
                      </button>
                      <button
                        onClick={() => setBackupToRestore(backup.filename)}
                        className="text-blue-600 hover:text-blue-900 mr-4"
                      >
                        Restore
                      </button>
                      <button
                        onClick={() => setBackupToDelete(backup.filename)}
                        className="text-red-600 hover:text-red-900"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-8 text-center text-gray-500">
            <RiDatabase2Line className="mx-auto h-12 w-12 text-gray-400 mb-4" />
            <p>No backups found. Create your first backup to protect your data.</p>
          </div>
        )}
      </div>

      {/* Reset Confirmation Dialog */}
      {isConfirmingReset && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Reset Database</h3>
            <p className="text-red-600 font-medium mb-4">⚠️ Warning: This is a destructive action!</p>
            <p className="text-gray-600 mb-6">
              This will reset the database to its default state. All DNS rules, backends, and logs will be permanently deleted.
              A backup of the current database will be created before resetting.
            </p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setIsConfirmingReset(false)}
                className="px-4 py-2 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50"
                disabled={resetDatabaseMutation.isPending}
              >
                Cancel
              </button>
              <button
                onClick={() => resetDatabaseMutation.mutate()}
                className="px-4 py-2 rounded-md bg-red-600 text-white hover:bg-red-700"
                disabled={resetDatabaseMutation.isPending}
              >
                {resetDatabaseMutation.isPending ? 'Resetting...' : 'Reset Database'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Restore Confirmation Dialog */}
      {backupToRestore && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Restore Database</h3>
            <p className="text-amber-600 font-medium mb-4">⚠️ Warning: This will overwrite your current database!</p>
            <p className="text-gray-600 mb-6">
              Are you sure you want to restore the database from backup <span className="font-mono bg-gray-100 px-1">{backupToRestore}</span>?
              A backup of your current database will be created before restoring.
            </p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setBackupToRestore(null)}
                className="px-4 py-2 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50"
                disabled={restoreBackupMutation.isPending}
              >
                Cancel
              </button>
              <button
                onClick={() => restoreBackupMutation.mutate(backupToRestore)}
                className="px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700"
                disabled={restoreBackupMutation.isPending}
              >
                {restoreBackupMutation.isPending ? 'Restoring...' : 'Restore Backup'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      {backupToDelete && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Delete Backup</h3>
            <p className="text-gray-600 mb-6">
              Are you sure you want to delete the backup <span className="font-mono bg-gray-100 px-1">{backupToDelete}</span>?
              This action cannot be undone.
            </p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setBackupToDelete(null)}
                className="px-4 py-2 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50"
                disabled={deleteBackupMutation.isPending}
              >
                Cancel
              </button>
              <button
                onClick={() => deleteBackupMutation.mutate(backupToDelete)}
                className="px-4 py-2 rounded-md bg-red-600 text-white hover:bg-red-700"
                disabled={deleteBackupMutation.isPending}
              >
                {deleteBackupMutation.isPending ? 'Deleting...' : 'Delete Backup'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Database; 