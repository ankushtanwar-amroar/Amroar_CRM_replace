import React, { useState } from 'react';
import { Bot } from 'lucide-react';
import { Button } from '../../components/ui/button';
import CluBotChat from './CluBotChat';

/**
 * Floating CLU-BOT Button that can be added to any page
 * Opens the CLU-BOT chat panel when clicked
 */
const CluBotButton = ({ context = null }) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      {/* Floating Button */}
      {!isOpen && (
        <Button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 right-6 w-14 h-14 rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-lg hover:shadow-xl transition-all z-40"
          data-testid="clu-bot-open-btn"
        >
          <Bot className="w-6 h-6 text-white" />
        </Button>
      )}

      {/* Chat Panel */}
      <CluBotChat
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        context={context}
      />
    </>
  );
};

export default CluBotButton;
