export const windowsFolderPicker = String.raw`
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
if (-not [Environment]::UserInteractive) { throw 'An interactive desktop is required.' }

Add-Type -ReferencedAssemblies 'System.Windows.Forms.dll', 'System.Drawing.dll' -TypeDefinition @'
using System;
using System.Drawing;
using System.Runtime.InteropServices;
using System.Windows.Forms;

public static class ReportFolderDialog
{
    [ComImport, Guid("42F85136-DB7E-439C-85F1-E4075D135FC8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IFileDialog
    {
        // The method order follows the IFileDialog COM vtable.
        [PreserveSig] int Show(IntPtr parent);
        void SetFileTypes(uint count, IntPtr types);
        void SetFileTypeIndex(uint index);
        void GetFileTypeIndex(out uint index);
        void Advise(IntPtr events, out uint cookie);
        void Unadvise(uint cookie);
        void SetOptions(uint options);
        void GetOptions(out uint options);
        void SetDefaultFolder(IShellItem folder);
        [PreserveSig] int SetFolder(IShellItem folder);
        void GetFolder(out IShellItem folder);
        void GetCurrentSelection(out IShellItem item);
        void SetFileName([MarshalAs(UnmanagedType.LPWStr)] string name);
        void GetFileName(out IntPtr name);
        void SetTitle([MarshalAs(UnmanagedType.LPWStr)] string title);
        void SetOkButtonLabel([MarshalAs(UnmanagedType.LPWStr)] string label);
        void SetFileNameLabel([MarshalAs(UnmanagedType.LPWStr)] string label);
        void GetResult(out IShellItem item);
    }

    [ComImport, Guid("43826D1E-E718-42EE-BC55-A1E261C37BFE"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IShellItem
    {
        void BindToHandler(IntPtr bindContext, ref Guid handler, ref Guid type, out IntPtr result);
        void GetParent(out IShellItem parent);
        void GetDisplayName(uint kind, out IntPtr name);
    }

    [DllImport("shell32.dll", CharSet = CharSet.Unicode, ExactSpelling = true)]
    private static extern int SHCreateItemFromParsingName(
        string path, IntPtr bindContext, ref Guid type, out IShellItem item);

    [DllImport("user32.dll")]
    private static extern IntPtr GetForegroundWindow();

    private const uint PickFolders = 0x20;
    private const uint ForceFileSystem = 0x40;
    private const uint NoRecentItems = 0x02000000;
    private const uint FileSystemPath = 0x80058000;
    private const int Cancelled = unchecked((int)0x800704C7);

    public static string Choose(string initialPath)
    {
        var dialogType = Type.GetTypeFromCLSID(new Guid("DC1C5A9C-E88A-4DDE-A5A1-60F82A20AEF7"));
        var dialog = (IFileDialog)Activator.CreateInstance(dialogType);
        try
        {
            uint options;
            dialog.GetOptions(out options);
            dialog.SetOptions(options | PickFolders | ForceFileSystem | NoRecentItems);
            dialog.SetTitle("Choose a folder");

            if (!String.IsNullOrEmpty(initialPath))
            {
                var itemType = typeof(IShellItem).GUID;
                IShellItem startFolder;
                if (SHCreateItemFromParsingName(initialPath, IntPtr.Zero, ref itemType, out startFolder) == 0)
                {
                    try { dialog.SetFolder(startFolder); }
                    finally { Marshal.ReleaseComObject(startFolder); }
                }
            }

            var screen = Screen.FromHandle(GetForegroundWindow()).WorkingArea;
            using (var owner = new Form())
            {
                // The dialog inherits TopMost from its owner. Use the active window's monitor.
                owner.TopMost = true;
                owner.ShowInTaskbar = false;
                owner.Opacity = 0;
                owner.FormBorderStyle = FormBorderStyle.None;
                owner.StartPosition = FormStartPosition.Manual;
                owner.Bounds = new Rectangle(screen.Left + screen.Width / 2, screen.Top + screen.Height / 2, 1, 1);
                owner.Show();
                owner.Activate();

                var result = dialog.Show(owner.Handle);
                if (result == Cancelled) return null;
                Marshal.ThrowExceptionForHR(result);
            }

            IShellItem selected;
            dialog.GetResult(out selected);
            try
            {
                IntPtr name;
                selected.GetDisplayName(FileSystemPath, out name);
                try { return Marshal.PtrToStringUni(name); }
                finally { Marshal.FreeCoTaskMem(name); }
            }
            finally { Marshal.ReleaseComObject(selected); }
        }
        finally { Marshal.ReleaseComObject(dialog); }
    }
}
'@

$folder = [ReportFolderDialog]::Choose($env:UIUX_PICKER_INITIAL_DIRECTORY)
if ($null -ne $folder) { [Console]::WriteLine($folder) }
`;
