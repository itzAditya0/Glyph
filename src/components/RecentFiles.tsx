import { useEffect, useRef } from "react";
import styles from "./RecentFiles.module.css";

interface RecentFile {
  path: string;
  openedAt: number;
}

interface RecentFilesProps {
  files: RecentFile[];
  onOpenFile: (path: string) => void;
  onClear: () => void;
  onClose: () => void;
}

function getFileName(path: string): string {
  return path.split("/").pop() ?? path.split("\\").pop() ?? path;
}

export default function RecentFiles({
  files,
  onOpenFile,
  onClear,
  onClose,
}: RecentFilesProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [onClose]);

  return (
    <div ref={ref} className={styles.dropdown} role="menu">
      {files.length === 0 ? (
        <div className={styles.empty}>No recent files</div>
      ) : (
        <>
          {files.map((file) => (
            <button
              key={file.path}
              className={styles.item}
              role="menuitem"
              onClick={() => {
                onOpenFile(file.path);
                onClose();
              }}
              title={file.path}
            >
              {getFileName(file.path)}
            </button>
          ))}
          <div className={styles.divider} />
          <button
            className={styles.clearBtn}
            role="menuitem"
            onClick={() => {
              onClear();
              onClose();
            }}
          >
            Clear Recent
          </button>
        </>
      )}
    </div>
  );
}
