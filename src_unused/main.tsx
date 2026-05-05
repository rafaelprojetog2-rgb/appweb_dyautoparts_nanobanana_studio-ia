import { useEffect } from "react";
import { abrirDB } from "./services/db";

export default function App() {

  useEffect(() => {

    abrirDB().then(() => {
      console.log("Banco offline iniciado");
    });

  }, []);

  return (
    <div>
      Sistema DY AutoParts iniciado
    </div>
  );
}