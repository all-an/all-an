using System;

namespace FloatingPointVariable
{
    class Program
    {
        static void Main(string[] args)
        {
            double idade, Salario;

            Salario = 1200.50;

            idade = 15.0 / 2;

            idade = 5.0 / 3;

            int salarioEmInteiro = (int)Salario;

            Console.WriteLine("Meu salário é " + Salario);
            Console.WriteLine("Meu salário em inteiros: " + salarioEmInteiro);
        }
    }
}
