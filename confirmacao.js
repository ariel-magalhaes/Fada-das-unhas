import { db } from "./firebase.js";
import { doc, onSnapshot } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";

const dadosLocal = JSON.parse(localStorage.getItem("agendamento"));

if (!dadosLocal || !dadosLocal.id) {
  window.location.href = "index.html";
} else {
  const confNome = document.getElementById("confNome");
  const confEmail = document.getElementById("confEmail");
  const confData = document.getElementById("confData");
  const confHorario = document.getElementById("confHorario");
  const confServico = document.getElementById("confServico");
  const confQuantidade = document.getElementById("confQuantidade");
  const itemQuantidade = document.getElementById("itemQuantidade");
  const confObservacao = document.getElementById("confObservacao");
  const statusElemento = document.getElementById("confStatus");
  const btnWhatsApp = document.getElementById("btnWhatsApp");

  const numeroWhatsApp = "5528999671113";
  const refAgendamento = doc(db, "agendamentos", dadosLocal.id);

  function atualizarStatusVisual(status) {
    statusElemento.className = "status-badge";

    if (status === "confirmado") {
      statusElemento.textContent = "Confirmado";
      statusElemento.classList.add("status-confirmado");
    } else if (status === "cancelado") {
      statusElemento.textContent = "Cancelado";
      statusElemento.classList.add("status-cancelado");
    } else {
      statusElemento.textContent = "Pendente de confirmação";
      statusElemento.classList.add("status-pendente");
    }
  }

  onSnapshot(
    refAgendamento,
    (snapshot) => {
      if (!snapshot.exists()) {
        window.location.href = "index.html";
        return;
      }

      const dados = {
        id: snapshot.id,
        ...snapshot.data()
      };

      localStorage.setItem("agendamento", JSON.stringify(dados));

      confNome.textContent = dados.nome || "";
      confEmail.textContent = dados.email || "";
      confData.textContent = dados.data || "";
      confHorario.textContent = dados.horario || "";
      confServico.textContent = dados.servico || "";
      confObservacao.textContent = dados.observacao || "Nenhuma";

      if (dados.servico === "Reposição de unha" && dados.quantidade) {
        itemQuantidade.classList.remove("hidden");
        confQuantidade.textContent = `${dados.quantidade} unha${dados.quantidade > 1 ? "s" : ""}`;
      } else {
        itemQuantidade.classList.add("hidden");
        confQuantidade.textContent = "";
      }

      atualizarStatusVisual(dados.status || "pendente");

      const linhaQuantidade =
        dados.servico === "Reposição de unha" && dados.quantidade
          ? `Quantidade de unhas: ${dados.quantidade}\n`
          : "";

      const mensagem =
`Olá! Gostaria de confirmar um agendamento.

Nome: ${dados.nome}
E-mail: ${dados.email}
Data: ${dados.data}
Horário: ${dados.horario}
Serviço: ${dados.servico}
${linhaQuantidade}Observação: ${dados.observacao || "Nenhuma"}
Status: ${dados.status || "pendente"}`;

      btnWhatsApp.href = `https://wa.me/${numeroWhatsApp}?text=${encodeURIComponent(mensagem)}`;
      btnWhatsApp.target = "_blank";
    },
    (error) => {
      console.error("Erro ao carregar confirmação em tempo real:", error);
    }
  );
}