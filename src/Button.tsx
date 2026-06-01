import React, { useEffect, useRef } from 'react';
import { setIcon } from 'obsidian';
import { CommandsManager } from './Commands';

type ButtonProps = {
  onClick: () => void;
  buttonRef: React.RefObject<HTMLButtonElement>;
  icon: string;
};

const ButtonWithIcon = ({ onClick, buttonRef, icon }: ButtonProps) => {
  useEffect(() => {
    if (buttonRef.current) {
      setIcon(buttonRef.current, icon);
    }
  }, []);

  return <button ref={buttonRef} className="dt-button" onClick={onClick} />;
};

type ButtonContainerProps = {
  commandsManager: CommandsManager;
};

export const ButtonContainer = ({ commandsManager }: ButtonContainerProps) => {
  const initButtonRef = useRef(null);

  return (
    <div className="dt-button-container">
      <ButtonWithIcon
        buttonRef={initButtonRef}
        onClick={() => commandsManager.initializeTimetableView()}
        icon="refresh-ccw"
      />
    </div>
  );
};

export default ButtonWithIcon;
