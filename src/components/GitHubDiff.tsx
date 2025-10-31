interface GitHubDiffProps {
  diff: string;
}

export default function GitHubDiff({ diff }: GitHubDiffProps) {
  const lines = diff.split('\n');
  
  return (
    <div className="diff-container bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm">
      {lines.map((line, idx) => {
        // Detect if line contains "Create", "Update", "Delete" or has → symbol
        let lineClass = 'diff-line diff-context';
        let prefix = '';
        
        if (line.startsWith('Create') || line.includes('→')) {
          lineClass = 'diff-line diff-added';
          prefix = '+ ';
        } else if (line.startsWith('Delete') || line.startsWith('Remove')) {
          lineClass = 'diff-line diff-removed';
          prefix = '- ';
        } else if (line.startsWith('Update')) {
          lineClass = 'diff-line diff-context';
          prefix = '  ';
        }
        
        return (
          <div key={idx} className={lineClass}>
            <span className="select-none opacity-50 mr-2">{prefix}</span>
            {line}
          </div>
        );
      })}
    </div>
  );
}

