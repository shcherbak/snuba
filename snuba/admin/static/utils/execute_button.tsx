import React, { useState } from "react";
import { Button } from "@mantine/core";

function ExecuteButton(props: {
  disabled: boolean;
  onClick: () => Promise<any>;
  onError?: (error: any) => any;
}) {
  const [isExecuting, setIsExecuting] = useState<boolean>(false);

  const defaultError = (err: any) => {
    console.log("ERROR", err);
    window.alert("An error occurred: " + err.error.message);
  };
  let errorCallback = props.onError || defaultError;

  function executeQuery() {
    if (isExecuting) {
      window.alert("A query is already running");
    }
    setIsExecuting(true);
    props
      .onClick()
      .catch((err: any) => {
        errorCallback(err);
      })
      .finally(() => {
        setIsExecuting(false);
      });
  }

  return (
    <div>
      <Button
        onClick={(evt: any) => {
          evt.preventDefault();
          executeQuery();
        }}
        loading={isExecuting}
        disabled={isExecuting || props.disabled}
      >
        Execute Query
      </Button>
    </div>
  );
}

export default ExecuteButton;
