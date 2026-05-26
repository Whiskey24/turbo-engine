"use client";

import DataTransferActions from "@/components/data-transfer-actions";
import DeleteAllDataAction from "@/components/delete-all-data-action";
import LoginHistory from "@/components/login-history";
import ChangePassword from "@/components/change-password";

export default function SettingsPage() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Settings</h1>

      <div className="space-y-6">
        {/* Login History Section */}
        <div className="border rounded-lg p-4">
          <h2 className="text-lg font-semibold mb-2">Login History</h2>
          <p className="text-sm text-muted-foreground mb-4">
            View your recent login activity
          </p>
          <LoginHistory />
        </div>

        {/* Change Password Section */}
        <div className="border rounded-lg p-4">
          <h2 className="text-lg font-semibold mb-2">Change Password</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Update your account password
          </p>
          <ChangePassword />
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