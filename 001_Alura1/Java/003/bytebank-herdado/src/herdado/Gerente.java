package herdado;

//Gerente � um funcion�rio
public class Gerente extends Funcionario {
		public int senha;
		
		public boolean autentica(int senha) {
			if(this.senha == senha) {
				return true;
			} else {
				return false;
			}
		}
		
		public double getBonificacao() {  //get foi usado somente como nome do modulo mas n�o se refere a um atributo
			return this.salario; //gerente ganha um salario inteiro de bonifica��o
		}
		
}
