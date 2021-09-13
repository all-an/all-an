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

