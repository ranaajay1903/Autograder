import { useEffect } from 'react';
import './Modal.css';

export default function Modal({ 
  isOpen, 
  onClose, 
  title = '', 
  message = '', 
  type = 'info', 
  actions = [] 
}) {
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }
    
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'auto';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const defaultAction = {
    label: 'OK',
    onClick: onClose,
    variant: 'primary'
  };

  const finalActions = actions.length > 0 ? actions : [defaultAction];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className={`modal-container modal-${type}`} onClick={(e) => e.stopPropagation()}>

        <div className="modal-content">
          <p className="modal-message">{message}</p>
        </div>

        <div className="modal-actions">
          {finalActions.map((action, idx) => (
            <button
              key={idx}
              className={`modal-btn modal-btn-${action.variant || 'primary'}`}
              onClick={() => {
                action.onClick?.();
              }}
            >
              {action.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
