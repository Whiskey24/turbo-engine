"use client";

import DataTransferActions from "@/components/data-transfer-actions";
import DeleteAllDataAction from "@/components/delete-all-data-action";
import LoginHistory from "@/components/login-history";

export default function SettingsPage() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Settings</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Change Password Section */}
        <div className="border rounded-lg p-4">
          <h2 className="text-lg font-semibold mb-2">Change Password</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Update your account password
          </p>
          <div className="bg-gray-100 rounded-lg p-4 text-center text-gray-500">
            Password change functionality coming soon
          </div>
        </div>

        {/* Login History Section */}
        <div className="border rounded-lg p-4">
          <h2 className="text-lg font-semibold mb-2">Login History</h2>
          <p className="text-sm text-muted-foreground mb-4">
            View your recent login activity
          </p>
          <LoginHistory />
        </div>

        {/* Backup & Restore Section */}
        <div className="border rounded-lg p-4">
          <h2 className="text-lg font-semibold mb-2">Backup & Restore</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Export or import your portfolio data
          </p>
          <DataTransferActions />
        </div>

        {/* Delete My Data Section */}
        <div className="border rounded-lg p-4">
          <h2 className="text-lg font-semibold mb-2">Delete My Data</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Permanently remove all your portfolio data
          </p>
          <DeleteAllDataAction />
        </div>
      </div>
      
      <div className="mt-8 pt-4 border-t text-sm text-muted-foreground text-right">
        <div>Version: {process.env.NEXT_PUBLIC_BUILD_NUMBER}</div>
        <div>Build at: {process.env.NEXT_PUBLIC_BUILD_TIME}</div>
      </div>
    </div>
  );
}
