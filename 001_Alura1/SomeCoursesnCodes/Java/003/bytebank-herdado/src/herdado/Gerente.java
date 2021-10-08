package herdado;

//Gerente é um funcionário
public class Gerente extends Funcionario {
		public int senha;
		
		public boolean autentica(int senha) {
			if(this.senha == senha) {
				return true;
			} else {
				return false;
			}
		}
		
		public double getBonificacao() {  //get foi usado somente como nome do modulo mas não se refere a um atributo
			return this.salario; //gerente ganha um salario inteiro de bonificação
		}
		
}
