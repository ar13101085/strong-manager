import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { usersAPI } from '../services/api';
import { 
  RiAddLine, 
  RiEditLine, 
  RiDeleteBinLine, 
  RiSearchLine,
  RiUserLine,
  RiShieldUserLine 
} from 'react-icons/ri';

interface User {
  id: number;
  email: string;
  role: string;
}

const Users: React.FC = () => {
  const queryClient = useQueryClient();
  
  // Form states
  const [newUser, setNewUser] = useState<{
    email: string;
    password: string;
    role: string;
  }>({
    email: '',
    password: '',
    role: 'user',
  });

  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [showUserForm, setShowUserForm] = useState(false);

  // Search states
  const [userSearch, setUserSearch] = useState('');

  // Selection states
  const [selectedUsers, setSelectedUsers] = useState<number[]>([]);

  // Fetch users
  const { data: users, isLoading: usersLoading } = useQuery<User[]>({
    queryKey: ['users'],
    queryFn: async () => {
      const response = await usersAPI.getAll();
      return response.data;
    },
  });

  // Mutations
  const createUser = useMutation({
    mutationFn: (data: typeof newUser) => usersAPI.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      resetUserForm();
      setShowUserForm(false);
    },
  });

  const updateUser = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<User> }) => 
      usersAPI.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setEditingUser(null);
      setShowUserForm(false);
    },
  });

  const deleteUser = useMutation({
    mutationFn: (id: number) => usersAPI.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setSelectedUsers([]);
    },
  });

  // Form handlers
  const handleUserSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingUser) {
      // When updating a user, we might not want to update the password if it's empty
      const updateData: Partial<User> = { 
        email: newUser.email,
        role: newUser.role 
      };
      
      if (newUser.password) {
        updateData.password = newUser.password;
      }
      
      updateUser.mutate({ 
        id: editingUser.id, 
        data: updateData
      });
    } else {
      createUser.mutate(newUser);
    }
  };

  const resetUserForm = () => {
    setNewUser({
      email: '',
      password: '',
      role: 'user',
    });
    setEditingUser(null);
  };

  const editUser = (user: User) => {
    setEditingUser(user);
    setNewUser({
      email: user.email,
      password: '', // We don't display the current password
      role: user.role,
    });
    setShowUserForm(true);
  };

  const handleUserSelect = (id: number) => {
    setSelectedUsers(prev => 
      prev.includes(id) 
        ? prev.filter(itemId => itemId !== id) 
        : [...prev, id]
    );
  };

  const handleSelectAllUsers = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked && users) {
      setSelectedUsers(users.map(user => user.id));
    } else {
      setSelectedUsers([]);
    }
  };

  const deleteSelectedUsers = () => {
    if (window.confirm(`Are you sure you want to delete ${selectedUsers.length} users?`)) {
      selectedUsers.forEach(id => deleteUser.mutate(id));
    }
  };

  // Filter users based on search
  const filteredUsers = users?.filter(user =>
    user.email.toLowerCase().includes(userSearch.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Title */}
      <div>
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Users</h1>
        </div>
      </div>

      {/* User Form */}
      {showUserForm && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-medium text-gray-800 mb-4">
            {editingUser ? 'Edit User' : 'Create User'}
          </h2>
          
          <form onSubmit={handleUserSubmit}>
            <div className="space-y-4">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                  Email
                </label>
                <input
                  type="email"
                  name="email"
                  id="email"
                  required
                  placeholder="user@example.com"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={newUser.email}
                  onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                />
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                  Password {editingUser && <span className="text-gray-500 text-xs">(Leave blank to keep current password)</span>}
                </label>
                <input
                  type="password"
                  name="password"
                  id="password"
                  required={!editingUser}
                  placeholder={editingUser ? "••••••••" : "Password"}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={newUser.password}
                  onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                />
              </div>

              <div>
                <label htmlFor="role" className="block text-sm font-medium text-gray-700 mb-1">
                  Role
                </label>
                <select
                  name="role"
                  id="role"
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={newUser.role}
                  onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
                >
                  <option value="user">User</option>
                  <option value="admin">Admin</option>
                </select>
              </div>

              <div className="flex justify-end space-x-2 pt-4">
                <button
                  type="button"
                  className="px-4 py-2 bg-white text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50"
                  onClick={() => {
                    resetUserForm();
                    setShowUserForm(false);
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                >
                  {createUser.isPending || updateUser.isPending
                    ? 'Saving...'
                    : editingUser
                    ? 'Update User'
                    : 'Create User'}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* Users List */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 flex flex-wrap justify-between items-center gap-4">
          <h2 className="text-lg font-medium text-gray-800">System Users</h2>
          
          <div className="flex items-center space-x-4">
            {selectedUsers.length > 0 && (
              <button
                onClick={deleteSelectedUsers}
                className="flex items-center px-4 py-2 text-sm text-red-600 bg-red-50 rounded-md hover:bg-red-100"
              >
                <RiDeleteBinLine className="mr-1" size={16} />
                Delete Selected ({selectedUsers.length})
              </button>
            )}
            
            <button
              onClick={() => {
                resetUserForm();
                setShowUserForm(!showUserForm);
              }}
              className="flex items-center px-4 py-2 text-sm text-white bg-blue-600 rounded-md hover:bg-blue-700"
            >
              <RiAddLine className="mr-1" size={16} />
              Add User
            </button>
          </div>
        </div>
        
        <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
          <div className="relative flex-1 max-w-md">
            <input
              type="text"
              placeholder="Search users..."
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <RiSearchLine className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
          </div>
        </div>
        
        <div className="overflow-x-auto">
          {usersLoading ? (
            <div className="flex justify-center items-center h-40">
              <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-blue-500"></div>
            </div>
          ) : filteredUsers && filteredUsers.length > 0 ? (
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left">
                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                        checked={selectedUsers.length === filteredUsers.length && filteredUsers.length > 0}
                        onChange={handleSelectAllUsers}
                      />
                    </div>
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Email
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Role
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredUsers.map((user) => (
                  <tr key={user.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <input
                        type="checkbox"
                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                        checked={selectedUsers.includes(user.id)}
                        onChange={() => handleUserSelect(user.id)}
                      />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {user.email}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`px-2 py-1 inline-flex items-center text-xs leading-5 font-semibold rounded-full ${
                          user.role === 'admin'
                            ? 'bg-purple-100 text-purple-800'
                            : 'bg-blue-100 text-blue-800'
                        }`}
                      >
                        {user.role === 'admin' ? (
                          <><RiShieldUserLine className="mr-1" size={14} /> Admin</>
                        ) : (
                          <><RiUserLine className="mr-1" size={14} /> User</>
                        )}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <button
                        onClick={() => editUser(user)}
                        className="text-blue-600 hover:text-blue-900 mr-4"
                      >
                        <RiEditLine size={18} />
                      </button>
                      <button
                        onClick={() => {
                          if (window.confirm('Are you sure you want to delete this user?')) {
                            deleteUser.mutate(user.id);
                          }
                        }}
                        className="text-red-600 hover:text-red-900"
                      >
                        <RiDeleteBinLine size={18} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="flex flex-col items-center justify-center h-40">
              <p className="text-gray-500 mb-4">No users found</p>
              <button
                onClick={() => {
                  resetUserForm();
                  setShowUserForm(true);
                }}
                className="flex items-center px-4 py-2 text-sm text-white bg-blue-600 rounded-md hover:bg-blue-700"
              >
                <RiAddLine className="mr-1" size={16} />
                Add First User
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Users; 