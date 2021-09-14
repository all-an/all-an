let titulo = document.querySelector(".titulo"); 

titulo.textContent = "Aparecida Nutricionista";

let pacientes = document.querySelectorAll(".paciente"); //All para selecionar toto o array



for(i = 0; i < pacientes.length; i++){ //varre o array
    let paciente = pacientes[i];

    let tdPeso = paciente.querySelector(".info-peso");
    let peso = (tdPeso.textContent);

    let tdAltura = paciente.querySelector(".info-altura");
    let altura = (tdAltura.textContent);

    let imc = (peso / (altura * altura)).toFixed(1); //mostra apenas uma casa decimal

    if(peso <= 0 || peso >= 999){
        console.log("Peso Inválido");
        imc = "Peso Inválido";
        paciente.classList.add("paciente-invalido"); //altera a classe alterando o estilo
    }

    if(altura <= 0 || altura >= 3.5){
        console.log("Altura Inválida");
        imc = "Altura Inválida";
        paciente.classList.add("paciente-invalido"); //altera a classe alterando o estilo
    }
    console.log(imc);

    let tdImc = paciente.querySelector(".info-imc");
    tdImc.textContent = imc;
}

let botaoAdicionar = document.querySelector("#adicionar-paciente"); 

botaoAdicionar.addEventListener("click", function(event){ //eventListener ouve o que acontece na ação
    event.preventDefault();

    let form = document.querySelector("#form-adiciona");
    console.log(form.nome.value);

    var nome = form.nome.value;
    var peso = form.peso.value;
    var altura = form.altura.value;
    var gordura = form.gordura.value;

    var pacienteTr = document.createElement("tr");

    var nomeTd = document.createElement("td");
    var pesoTd = document.createElement("td");
    var alturaTd = document.createElement("td");
    var gorduraTd = document.createElement("td");
    var imcTd = document.createElement("td");

    nomeTd.textContent = nome;
    pesoTd.textContent = peso;
    alturaTd.textContent = altura;
    gorduraTd.textContent = gordura;

    pacienteTr.appendChild(nomeTd);
    pacienteTr.appendChild(pesoTd);
    pacienteTr.appendChild(alturaTd);
    pacienteTr.appendChild(gorduraTd);

    var tabela = document.querySelector("#tabela-pacientes");

    tabela.appendChild(pacienteTr);

    console.log("Botão Clicado");

})

titulo.addEventListener("click", function(){alert("Fui Clicado")}); //função anônima como argumento 
/*
titulo.addEventListener("click", mostraMensagem); //argumentos da função addEventListener são "click" e mostraMensagem

function mostraMensagem(){
    alert("Fui Clicado");
}*/